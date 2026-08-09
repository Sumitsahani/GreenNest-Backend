export interface AppConfiguration {
  nodeEnv: string;
  port: number;
  databaseConnectOnStartup: boolean;
  corsOrigins: string[];
}

export default (): AppConfiguration => ({
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 3000),
  databaseConnectOnStartup: process.env.DATABASE_CONNECT_ON_STARTUP === 'true',
  corsOrigins: [process.env.WEB_APP_ORIGIN, process.env.MOBILE_APP_ORIGIN].filter(
    (origin): origin is string => Boolean(origin),
  ),
});
