import knex from "knex";
import knexTinyLogger from "knex-tiny-logger";

const options = {
  client: "pg",
  connection: {
    host: "127.0.0.1",
    user: "postgres",
    password: "postgres",
    database: "postgres",
    port: 5432,
  },
};

export default knexTinyLogger(knex(options));
