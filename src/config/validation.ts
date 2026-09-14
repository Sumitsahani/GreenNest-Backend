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
  DATABASE_CONNECT_ON_STARTUP: Joi.boolean().truthy('true').falsy('false').default(true),
  HOST: Joi.string().default('0.0.0.0'),
  DATABASE_CONNECT_ATTEMPTS: Joi.number().integer().min(1).max(5).default(3),
  SUPABASE_URL: Joi.string().uri().required(),
  SUPABASE_PUBLISHABLE_KEY: Joi.string().min(20).required(),
  WEB_APP_ORIGIN: Joi.string().uri().required(),
  MOBILE_APP_ORIGIN: Joi.string().optional().allow(''),
  THROTTLE_TTL_MS: Joi.number().integer().positive().default(60000),
  THROTTLE_LIMIT: Joi.number().integer().positive().default(100),
  GEMINI_API_KEY: Joi.string().min(20).optional(),
  GEMINI_FALLBACK_API_KEY: Joi.string().min(20).optional(),
  GEMINI_MODEL: Joi.string().default('gemini-3.5-flash-lite'),
  GEMINI_IDENTIFICATION_MODELS: Joi.string().optional(),
  GEMINI_SPACE_MODELS: Joi.string().optional(),
  GEMINI_IMAGE_MODEL: Joi.string().default('gemini-3.1-flash-image'),
  GEMINI_IMAGE_API_KEY: Joi.string().min(20).optional(),
  OPENAI_API_KEY: Joi.string().min(20).optional(),
  OPENAI_VISION_MODELS: Joi.string().optional(),
  SUPPORT_API_KEY: Joi.string().min(32).optional().allow(''),
  SUPABASE_SERVICE_ROLE_KEY: Joi.string().min(20).optional().allow(''),
  OTP_HASH_SECRET: Joi.string().min(32).optional().allow(''),
  OTP_LENGTH: Joi.number().integer().min(6).max(8).default(6),
  OTP_EXPIRY_MINUTES: Joi.number().integer().min(1).max(30).default(10),
  MAX_OTP_ATTEMPTS: Joi.number().integer().min(1).max(10).default(5),
  OTP_RESEND_COOLDOWN_SECONDS: Joi.number().integer().min(30).max(600).default(60),
  SMTP_HOST: Joi.string().optional().allow(''),
  SMTP_PORT: Joi.number().port().default(587),
  SMTP_SECURE: Joi.boolean().truthy('true').falsy('false').default(false),
  SMTP_USER: Joi.string().optional().allow(''),
  SMTP_PASSWORD: Joi.string().optional().allow(''),
  SMTP_FROM: Joi.string().optional().allow(''),
});
