import {
  Controller,
  Get,
  Patch,
  Delete,
  Param,
  Query,
  UseGuards,
  Request,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private notificationsService: NotificationsService) {}

  /**
   * Get notifications for current user
   * GET /api/v1/notifications
   */
  @Get()
  async getNotifications(
    @Request() req: { user: { sub: string } },
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('unreadOnly') unreadOnly?: string
  ) {
    return this.notificationsService.getForUser(req.user.sub, {
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
      unreadOnly: unreadOnly === 'true',
    });
  }

  /**
   * Get unread count
   * GET /api/v1/notifications/unread-count
   */
  @Get('unread-count')
  async getUnreadCount(@Request() req: { user: { sub: string } }) {
    const count = await this.notificationsService.getUnreadCount(req.user.sub);
    return { count };
  }

  /**
   * Mark all as read
   * PATCH /api/v1/notifications/read-all
   */
  @Patch('read-all')
  @HttpCode(HttpStatus.OK)
  async markAllAsRead(@Request() req: { user: { sub: string } }) {
    await this.notificationsService.markAllAsRead(req.user.sub);
    return { success: true };
  }

  /**
   * Mark single notification as read
   * PATCH /api/v1/notifications/:id/read
   */
  @Patch(':id/read')
  @HttpCode(HttpStatus.OK)
  async markAsRead(
    @Request() req: { user: { sub: string } },
    @Param('id', ParseUUIDPipe) id: string
  ) {
    await this.notificationsService.markAsRead(id, req.user.sub);
    return { success: true };
  }

  /**
   * Delete a notification
   * DELETE /api/v1/notifications/:id
   */
  @Delete(':id')
  async deleteNotification(
    @Request() req: { user: { sub: string } },
    @Param('id', ParseUUIDPipe) id: string
  ) {
    await this.notificationsService.deleteOne(id, req.user.sub);
    return { deleted: true };
  }
}
