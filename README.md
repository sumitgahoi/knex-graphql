# knex-graphql

## How to run?

edit db.js to change db settings
```bash
npm i
npm run start
```

## Usage
Goto http://localhost:4000 and use playground, for example
```bash
query {
  customer(email: "sumit@gmail.com") {
    email
    firstName
    address {
      line1
      line2
    }
    accounts {
      type
      balance
    }
  }
}
```
customer is a table name and email is a column. multiple columns can be specified separated by comma. address is a 1:1 or many to 1 relationship table to customer. account is a 1:many relationship table to customer.
