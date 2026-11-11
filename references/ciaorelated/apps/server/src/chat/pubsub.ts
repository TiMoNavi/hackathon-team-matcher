import { PubSub } from 'graphql-subscriptions'
// Optional: Redis PubSub (ioredis) für Multi-Instance
// import { RedisPubSub } from 'graphql-redis-subscriptions'

export const pubsub = new PubSub()
