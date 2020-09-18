const { DataSource } = require("apollo-datasource");
const DataLoader = require("dataloader");

class SQLDataSource extends DataSource {
  constructor(knex, table, col) {
    super();
    this.loader = new DataLoader(async (keys) => {
      const rows = await knex(table).whereIn(col, keys).andWhere(this.args);
      // ensure order
      return keys.map((key) => rows.filter((row) => row[col] === key));
    });
  }

  initialize(config) {
    this.context = config.context;
  }

  async load(id, args = {}) {
    this.args = args;
    return this.loader.load(id);
  }
}

module.exports = { SQLDataSource };
