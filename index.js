import { buildApolloServer } from "./typedefs";

buildApolloServer()
  .then((server) => server.listen())
  .then(({ url }) => {
    console.log(`🚀 Server ready at ${url}`);
  });
