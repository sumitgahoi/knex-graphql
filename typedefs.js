import knex from "./db";
import { ApolloServer } from "apollo-server";
import { SQLDataSource } from "./SQLDataSource";
import { addAuthClause } from "./authClause";
import { GraphQLDate, GraphQLTime, GraphQLDateTime } from "graphql-iso-date";
import GraphQLJSON from "graphql-type-json";

var pluralize = require("pluralize");
var _ = require("lodash");
var graphql = require("graphql");

const typesMap = {
  boolean: graphql.GraphQLBoolean,
  "character varying": graphql.GraphQLString,
  date: GraphQLDateTime,
  "double precision": graphql.GraphQLFloat,
  integer: graphql.GraphQLInt,
  jsonb: GraphQLJSON,
  numeric: graphql.GraphQLFloat,
  text: graphql.GraphQLString,
  "timestamp with time zone": GraphQLDateTime,
};

const getTables = async () => {
  return knex
    .raw(
      `select
        table_name,
            column_name,
            data_type
        from
            INFORMATION_SCHEMA.COLUMNS
        where
            table_schema = 'public'
            and column_name != '__version__'
        order by
            table_name,
            column_name;`
    )
    .then(({ rows }) => {
      const map = new Map();
      rows.forEach(({ table_name, column_name, data_type }) => {
        if (!map.get(table_name)) {
          map.set(table_name, []);
        }
        map.get(table_name).push({ column_name, data_type });
      });
      return map;
    });
};

const getRelationShips = async () => {
  return knex
    .raw(
      `SELECT
            tc.table_name, 
            kcu.column_name, 
            ccu.table_name AS foreign_table_name,
            ccu.column_name AS foreign_column_name 
        FROM 
            information_schema.table_constraints AS tc 
            JOIN information_schema.key_column_usage AS kcu
                ON tc.constraint_name = kcu.constraint_name
                AND tc.table_schema = kcu.table_schema
            JOIN information_schema.constraint_column_usage AS ccu
                ON ccu.constraint_name = tc.constraint_name
                AND ccu.table_schema = tc.table_schema
        WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public';`
    )
    .then(({ rows }) => {
      return rows;
    });
};

const getPrimaryKeys = async () => {
  return knex
    .raw(
      `select
          t.table_name,
          c.column_name
        from
          information_schema.key_column_usage as c
        left join information_schema.table_constraints as t on
          t.constraint_name = c.constraint_name
        where
          t.table_schema = 'public'
          and t.constraint_type = 'PRIMARY KEY';`
    )
    .then(({ rows }) => {
      return rows;
    });
};

const getPrimaryCol = (table_name, primaryKeys) => {
  const row = primaryKeys.find((row) => row.table_name === table_name);
  if (row) {
    return row.column_name;
  }
};

const createTypeDefs = (map, relations, primaryKeys) => {
  const fields = {};
  map.forEach((columns, table_name) => {
    fields[table_name] = createTypeDef(
      table_name,
      columns,
      relations,
      fields,
      map,
      getPrimaryCol(table_name, primaryKeys)
    );
  });
  return fields;
};

const getTypeForScalarColumn = (isPrimary, dbType) => {
  if (isPrimary) {
    return graphql.GraphQLID;
  } else {
    return typesMap[dbType];
  }
};

const createTypeDef = (
  table_name,
  columns,
  relations = [],
  typedefs,
  map,
  primaryCol
) =>
  new graphql.GraphQLObjectType({
    name: _.camelCase(table_name),
    fields: () => {
      const cols = columns.reduce((acc, col) => {
        acc[col.column_name] = {
          type: getTypeForScalarColumn(
            col.column_name === primaryCol,
            col.data_type
          ),
        };
        return acc;
      }, {});

      const manyToOne = relations.filter(
        (relation) => relation.table_name === table_name
      );

      const oneToMany = relations.filter(
        (relation) => relation.foreign_table_name === table_name
      );

      const _relations = manyToOne.reduce(
        (acc, { column_name, foreign_table_name, foreign_column_name }) => {
          acc[pluralize.singular(_.camelCase(foreign_table_name))] = {
            type: typedefs[foreign_table_name],
            resolve: async (parent, args, context, info) => {
              if (parent[column_name]) {
                const key = `${foreign_table_name}-${foreign_column_name}`;
                const res = await context.dataSources[key].load(
                  parent[column_name]
                );
                return res && res[0];
              }
            },
          };
          return acc;
        },
        {}
      );

      const __relations = oneToMany.reduce((acc, relation) => {
        acc[pluralize(_.camelCase(relation.table_name))] = {
          type: new graphql.GraphQLList(typedefs[relation.table_name]),
          args: map.get(relation.table_name).reduce((acc, col) => {
            acc[col.column_name] = { type: graphql.GraphQLString };
            return acc;
          }, {}),
          resolve: async (parent, args, context, info) => {
            const key = `${relation.table_name}-${relation.column_name}`;
            return context.dataSources[key].load(
              parent[relation.foreign_column_name],
              args
            );
          },
        };
        return acc;
      }, {});
      return { ...cols, ..._relations, ...__relations };
    },
  });

const createLoaders = (map, relations) => {
  const loaders = {};

  map.forEach((columns, table_name) => {
    const manyToOne = relations.filter(
      (relation) => relation.table_name === table_name
    );

    const oneToMany = relations.filter(
      (relation) => relation.foreign_table_name === table_name
    );

    manyToOne.forEach(({ foreign_table_name, foreign_column_name }) => {
      const key = `${foreign_table_name}-${foreign_column_name}`;
      const loader = new SQLDataSource(
        knex,
        foreign_table_name,
        foreign_column_name
      );
      loaders[key] = loader;
    });

    oneToMany.forEach(({ table_name, column_name }) => {
      const key = `${table_name}-${column_name}`;
      const loader = new SQLDataSource(knex, table_name, column_name);
      loaders[key] = loader;
    });
  });
  return loaders;
};

export const buildApolloServer = async () => {
  const map = await getTables();
  const relations = await getRelationShips();
  const primaryKeys = await getPrimaryKeys();
  const typedefs = createTypeDefs(map, relations, primaryKeys);
  const fields = {};
  Object.entries(typedefs).map(([table_name, def]) => {
    fields[pluralize.singular(_.camelCase(table_name))] = {
      type: new graphql.GraphQLList(def),
      args: map.get(table_name).reduce((acc, col) => {
        acc[col.column_name] = { type: graphql.GraphQLString };
        return acc;
      }, {}),
      resolve: async (parent, args, context, info) => {
        return knex(table_name).where(args);
        // return addAuthClause(knex(table_name).where(args), context, table_name);
      },
    };
  });

  const query = new graphql.GraphQLObjectType({
    name: "Query",
    fields,
  });

  const schema = new graphql.GraphQLSchema({
    query,
  });

  const getUser = (token) => ({
    email: "sumit@gmail.com",
  }); //mock

  return new ApolloServer({
    schema,
    dataSources: () => createLoaders(map, relations),
    // cache: new RedisCache({
    //   host: 'redis-server',
    // }),
    context: ({ req }) => {
      // Get the user token from the headers.
      const token = req.headers.authorization || "";

      // try to retrieve a user with the token
      const user = getUser(token);

      // add the user to the context
      return { user };
    },
  });
};
