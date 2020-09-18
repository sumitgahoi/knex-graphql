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
  }
}
```
