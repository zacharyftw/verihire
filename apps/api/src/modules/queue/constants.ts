// Queue names
export const QUEUE_NAMES = {
  EMAIL: 'email',
  CERTIFICATE: 'certificate',
  BLOCKCHAIN: 'blockchain',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];
