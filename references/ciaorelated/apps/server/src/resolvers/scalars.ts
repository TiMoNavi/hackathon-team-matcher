import GraphQLJSON, { GraphQLJSONObject } from "graphql-type-json";

export const scalarResolvers = {
  JSON: GraphQLJSON,
  JSONObject: GraphQLJSONObject,
};