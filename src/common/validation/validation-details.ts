import type { ValidationError } from 'class-validator';

export function toValidationDetails(errors: ValidationError[]): Record<string, string[]> {
  return errors.reduce<Record<string, string[]>>((details, error) => {
    const messages = error.constraints ? Object.values(error.constraints) : [];
    if (messages.length > 0) details[error.property] = messages;
    if (error.children && error.children.length > 0) {
      const childDetails = toValidationDetails(error.children);
      for (const [field, childMessages] of Object.entries(childDetails)) {
        details[`${error.property}.${field}`] = childMessages;
      }
    }
    return details;
  }, {});
}
