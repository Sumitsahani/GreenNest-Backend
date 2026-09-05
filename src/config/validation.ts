import Joi from 'joi';

export const environmentValidationSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'test', 'production').default('development'),
  PORT: Joi.number().port().default(3000),
  DATABASE_URL: Joi.string()
    .uri({ scheme: ['postgresql', 'postgres'] })
    .required(),
  DIRECT_URL: Joi.string()
    .uri({ scheme: ['postgresql', 'postgres'] })
    .required(),
  DATABASE_CONNECT_ON_STARTUP: Joi.boolean().truthy('true').falsy('false').default(false),
  SUPABASE_URL: Joi.string().uri().required(),
  SUPABASE_PUBLISHABLE_KEY: Joi.string().min(20).required(),
  WEB_APP_ORIGIN: Joi.string().uri().required(),
  MOBILE_APP_ORIGIN: Joi.string().optional().allow(''),
  THROTTLE_TTL_MS: Joi.number().integer().positive().default(60000),
  THROTTLE_LIMIT: Joi.number().integer().positive().default(100),
  GEMINI_API_KEY: Joi.string().min(20).optional(),
  GEMINI_MODEL: Joi.string().default('gemini-2.5-flash'),
  GEMINI_IDENTIFICATION_MODELS: Joi.string().optional(),
  OPENAI_API_KEY: Joi.string().min(20).optional(),
  OPENAI_VISION_MODELS: Joi.string().optional(),
  SUPPORT_API_KEY: Joi.string().min(32).optional().allow(''),
});
