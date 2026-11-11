// resolvers/index.ts
import GraphQLJSON, { GraphQLJSONObject } from 'graphql-type-json';
import  postResolvers  from "./postResolvers";
import  userResolvers  from "./userResolvers";
import  authResolvers  from "./authResolvers";
import  storyResolvers  from "./storyResolvers";
import { merge } from "lodash";
import followResolvers from "./followResolvers";
import feedResolvers from "./feedResolvers";
import profileMgmtResolvers from "./profileMgmtResolvers";
import vlogResolvers from "./vlogResolvers";
import postMediaResolvers from "./postMediaResolvers";
import notificationResolvers from './notificationResolvers';
import notificationSettingsResolvers from './notificationSettingsResolvers';
import shareResolvers from "./shareResolvers";
import postDetailResolvers from './postDetailResolvers';
import { scalarResolvers } from "./scalars";
import  termsResolvers  from "./termsResolvers";
import moderationResolvers from "./moderationResolvers";
import  {resolvers as chatResolvers}   from "../chat/resolvers"; 
import placeResolvers from "./placeResolvers";
import contextResolvers from "./contextResolvers";
import {contextSearchResolvers} from "./contextSearchResolvers";
import groupLinkResolvers from "./groupLinkResolvers";
import communityDiscoveryResolvers from "./communityDiscoveryResolvers";
import communityInfluenceResolvers from "./communityInfluenceResolvers";
import appConfigResolvers from "./appConfigResolvers";

const base = {
  JSON: GraphQLJSON,
  JSONObject: GraphQLJSONObject,
  // Falls du auch einen DateTime-Scalar nutzt (z.B. aus 'graphql-scalars'),
  // kannst du ihn hier ebenfalls registrieren:
  // DateTime: GraphQLDateTime,
};

export const resolvers = merge(
  {},
  base,
  postResolvers,
  userResolvers,
  authResolvers,
  storyResolvers,
  followResolvers,
  feedResolvers,
  profileMgmtResolvers,
  vlogResolvers,
  postMediaResolvers,
  notificationResolvers,
  notificationSettingsResolvers,
  shareResolvers,
  postDetailResolvers,
  scalarResolvers,
  moderationResolvers,
  termsResolvers,
  chatResolvers,
  placeResolvers,
  contextResolvers,
  contextSearchResolvers,
  groupLinkResolvers,
  communityDiscoveryResolvers,
  communityInfluenceResolvers,
  appConfigResolvers
);
