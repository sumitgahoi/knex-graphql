import knex from "knex";
import knexTinyLogger from "knex-tiny-logger";

const options = {
  client: "pg",
  connection: {
    host: "127.0.0.1",
    user: "nodejs",
    password: "nodejs",
    database: "cp",
    port: 5432,
  },
};

export default knexTinyLogger(knex(options));
