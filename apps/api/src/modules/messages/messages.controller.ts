import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  ParseUUIDPipe,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { MessagesService } from './messages.service';

interface AuthenticatedRequest {
  user: {
    sub: string;
    userType: string;
    candidateProfileId?: string;
    recruiterProfileId?: string;
  };
}

@Controller('messages')
@UseGuards(JwtAuthGuard)
export class MessagesController {
  constructor(private readonly messagesService: MessagesService) {}

  /**
   * List my conversations
   * GET /api/v1/messages/conversations
   */
  @Get('conversations')
  async getConversations(@Request() req: AuthenticatedRequest) {
    return this.messagesService.getConversations(req.user.sub);
  }

  /**
   * Start a new conversation
   * POST /api/v1/messages/conversations
   * Body: { userId?: string, candidateProfileId?: string, jobApplicationId?: string }
   */
  @Post('conversations')
  async startConversation(
    @Request() req: AuthenticatedRequest,
    @Body() body: { userId?: string; candidateProfileId?: string; jobApplicationId?: string }
  ) {
    let otherUserId = body.userId;

    // If candidateProfileId is provided instead of userId, resolve it
    if (!otherUserId && body.candidateProfileId) {
      otherUserId = await this.messagesService.resolveUserIdFromCandidateProfile(
        body.candidateProfileId
      );
    }

    if (!otherUserId) {
      throw new Error('Either userId or candidateProfileId must be provided');
    }

    return this.messagesService.startConversation(req.user.sub, otherUserId, body.jobApplicationId);
  }

  /**
   * Get messages for a conversation
   * GET /api/v1/messages/conversations/:id
   */
  @Get('conversations/:id')
  async getMessages(
    @Request() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('limit') limit?: string,
    @Query('before') before?: string
  ) {
    return this.messagesService.getMessages(id, req.user.sub, {
      limit: limit ? parseInt(limit, 10) : undefined,
      before,
    });
  }

  /**
   * Send a message in a conversation
   * POST /api/v1/messages/conversations/:id
   */
  @Post('conversations/:id')
  async sendMessage(
    @Request() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { content: string }
  ) {
    return this.messagesService.sendMessage(id, req.user.sub, body.content);
  }

  /**
   * Mark a conversation as read
   * PATCH /api/v1/messages/conversations/:id/read
   */
  @Patch('conversations/:id/read')
  async markAsRead(@Request() req: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.messagesService.markConversationRead(id, req.user.sub);
  }

  /**
   * Get total unread count
   * GET /api/v1/messages/unread-count
   */
  @Get('unread-count')
  async getUnreadCount(@Request() req: AuthenticatedRequest) {
    return this.messagesService.getUnreadTotal(req.user.sub);
  }
}
