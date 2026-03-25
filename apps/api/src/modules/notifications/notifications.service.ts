import { Injectable, Logger } from '@nestjs/common';
import { prisma, NotificationType } from '@verihire/database';

interface CreateNotificationInput {
  type: NotificationType;
  title: string;
  message: string;
  link?: string;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  async create(userId: string, input: CreateNotificationInput) {
    return prisma.notification.create({
      data: {
        userId,
        type: input.type,
        title: input.title,
        message: input.message,
        link: input.link,
        metadata: input.metadata as any,
      },
    });
  }

  async getForUser(
    userId: string,
    options?: { limit?: number; offset?: number; unreadOnly?: boolean }
  ) {
    const limit = options?.limit ?? 20;
    const offset = options?.offset ?? 0;

    const where: Record<string, unknown> = { userId };
    if (options?.unreadOnly) {
      where.read = false;
    }

    const [notifications, total] = await Promise.all([
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.notification.count({ where }),
    ]);

    return {
      data: notifications,
      meta: { total, limit, offset, hasMore: offset + notifications.length < total },
    };
  }

  async getUnreadCount(userId: string): Promise<number> {
    return prisma.notification.count({
      where: { userId, read: false },
    });
  }

  async markAsRead(notificationId: string, userId: string) {
    return prisma.notification.updateMany({
      where: { id: notificationId, userId },
      data: { read: true },
    });
  }

  async markAllAsRead(userId: string) {
    return prisma.notification.updateMany({
      where: { userId, read: false },
      data: { read: true },
    });
  }

  async deleteOne(notificationId: string, userId: string) {
    return prisma.notification.deleteMany({
      where: { id: notificationId, userId },
    });
  }

  async deleteOld(userId: string, olderThanDays = 90) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - olderThanDays);

    return prisma.notification.deleteMany({
      where: {
        userId,
        createdAt: { lt: cutoff },
      },
    });
  }
}
