import { Injectable } from '@nestjs/common';
import { prisma } from '@verihire/database';

@Injectable()
export class HealthService {
  check() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      service: 'verihire-api',
      version: process.env.npm_package_version || '0.1.0',
    };
  }

  async readiness() {
    const checks: Record<string, { status: string; latency?: number }> = {};

    // Database check
    const dbStart = Date.now();
    try {
      await prisma.$queryRaw`SELECT 1`;
      checks.database = { status: 'ok', latency: Date.now() - dbStart };
    } catch {
      checks.database = { status: 'error' };
    }

    const allHealthy = Object.values(checks).every((c) => c.status === 'ok');

    return {
      status: allHealthy ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      checks,
    };
  }

  liveness() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
    };
  }
}
