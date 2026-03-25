import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { prisma } from '@verihire/database';

@Injectable()
export class MessagesService {
  private readonly logger = new Logger(MessagesService.name);

  /**
   * Find existing or create new conversation for a job application.
   */
  async getOrCreateConversation(
    jobApplicationId: string,
    recruiterId: string,
    candidateUserId: string
  ) {
    // Check for existing conversation
    const existing = await prisma.conversation.findUnique({
      where: { jobApplicationId },
      include: {
        participants: {
          include: {
            user: { select: { id: true, firstName: true, lastName: true, userType: true } },
          },
        },
      },
    });

    if (existing) return existing;

    // Create new conversation with both participants
    return prisma.conversation.create({
      data: {
        jobApplicationId,
        participants: {
          create: [{ userId: recruiterId }, { userId: candidateUserId }],
        },
      },
      include: {
        participants: {
          include: {
            user: { select: { id: true, firstName: true, lastName: true, userType: true } },
          },
        },
      },
    });
  }

  /**
   * Start a conversation between two users, optionally linked to a job application.
   */
  async startConversation(initiatorUserId: string, otherUserId: string, jobApplicationId?: string) {
    if (initiatorUserId === otherUserId) {
      throw new BadRequestException('Cannot start a conversation with yourself');
    }

    // If linked to a job application, check for existing conversation
    if (jobApplicationId) {
      const existing = await prisma.conversation.findUnique({
        where: { jobApplicationId },
        include: {
          participants: {
            include: {
              user: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  userType: true,
                  avatarUrl: true,
                },
              },
            },
          },
          messages: { orderBy: { createdAt: 'desc' }, take: 1 },
        },
      });

      if (existing) return existing;

      // Verify the job application exists
      const application = await prisma.jobApplication.findUnique({
        where: { id: jobApplicationId },
      });
      if (!application) {
        throw new NotFoundException('Job application not found');
      }
    }

    // Verify both users exist
    const [initiator, other] = await Promise.all([
      prisma.user.findUnique({ where: { id: initiatorUserId }, select: { id: true } }),
      prisma.user.findUnique({ where: { id: otherUserId }, select: { id: true } }),
    ]);

    if (!initiator) throw new NotFoundException('Initiator user not found');
    if (!other) throw new NotFoundException('Other user not found');

    // If no jobApplicationId, check for existing conversation between these two users
    if (!jobApplicationId) {
      const existingConversation = await prisma.conversation.findFirst({
        where: {
          jobApplicationId: null,
          AND: [
            { participants: { some: { userId: initiatorUserId } } },
            { participants: { some: { userId: otherUserId } } },
          ],
        },
        include: {
          participants: {
            include: {
              user: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  userType: true,
                  avatarUrl: true,
                },
              },
            },
          },
          messages: { orderBy: { createdAt: 'desc' }, take: 1 },
        },
      });

      if (existingConversation) return existingConversation;
    }

    return prisma.conversation.create({
      data: {
        jobApplicationId: jobApplicationId || null,
        participants: {
          create: [{ userId: initiatorUserId }, { userId: otherUserId }],
        },
      },
      include: {
        participants: {
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                userType: true,
                avatarUrl: true,
              },
            },
          },
        },
        messages: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
    });
  }

  /**
   * List all conversations for a user with last message preview, other participant info, unread count.
   */
  async getConversations(userId: string) {
    const conversations = await prisma.conversation.findMany({
      where: {
        participants: { some: { userId } },
      },
      include: {
        participants: {
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                userType: true,
                avatarUrl: true,
              },
            },
          },
        },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: {
            sender: {
              select: { id: true, firstName: true, lastName: true },
            },
          },
        },
        jobApplication: {
          include: {
            job: {
              select: { id: true, title: true },
            },
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    // Calculate unread counts for each conversation
    const result = await Promise.all(
      conversations.map(async conv => {
        const participant = conv.participants.find(p => p.userId === userId);
        const lastReadAt = participant?.lastReadAt;

        const unreadCount = await prisma.message.count({
          where: {
            conversationId: conv.id,
            senderId: { not: userId },
            ...(lastReadAt ? { createdAt: { gt: lastReadAt } } : {}),
          },
        });

        const otherParticipant = conv.participants.find(p => p.userId !== userId);
        const lastMessage = conv.messages[0] || null;

        return {
          id: conv.id,
          jobApplication: conv.jobApplication
            ? {
                id: conv.jobApplication.id,
                jobTitle: conv.jobApplication.job.title,
                jobId: conv.jobApplication.job.id,
              }
            : null,
          otherParticipant: otherParticipant
            ? {
                userId: otherParticipant.user.id,
                firstName: otherParticipant.user.firstName,
                lastName: otherParticipant.user.lastName,
                userType: otherParticipant.user.userType,
                avatarUrl: otherParticipant.user.avatarUrl,
              }
            : null,
          lastMessage: lastMessage
            ? {
                id: lastMessage.id,
                content: lastMessage.content,
                createdAt: lastMessage.createdAt,
                senderId: lastMessage.senderId,
                senderName:
                  `${lastMessage.sender.firstName || ''} ${lastMessage.sender.lastName || ''}`.trim(),
              }
            : null,
          unreadCount,
          updatedAt: conv.updatedAt,
        };
      })
    );

    return result;
  }

  /**
   * Get paginated messages for a conversation (verify user is participant).
   * Also updates lastReadAt for the user.
   */
  async getMessages(
    conversationId: string,
    userId: string,
    options?: { limit?: number; before?: string }
  ) {
    // Verify user is a participant
    const participant = await prisma.conversationParticipant.findUnique({
      where: {
        conversationId_userId: { conversationId, userId },
      },
    });

    if (!participant) {
      throw new ForbiddenException('You are not a participant in this conversation');
    }

    const limit = options?.limit ?? 50;

    const where: Record<string, unknown> = { conversationId };
    if (options?.before) {
      where.createdAt = { lt: new Date(options.before) };
    }

    const messages = await prisma.message.findMany({
      where,
      include: {
        sender: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            avatarUrl: true,
            userType: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    // Update lastReadAt
    await prisma.conversationParticipant.update({
      where: { id: participant.id },
      data: { lastReadAt: new Date() },
    });

    // Also get conversation metadata
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        participants: {
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                userType: true,
                avatarUrl: true,
              },
            },
          },
        },
        jobApplication: {
          include: {
            job: { select: { id: true, title: true } },
          },
        },
      },
    });

    return {
      messages: messages.reverse(), // Return in chronological order
      conversation: conversation
        ? {
            id: conversation.id,
            jobApplication: conversation.jobApplication
              ? {
                  id: conversation.jobApplication.id,
                  jobTitle: conversation.jobApplication.job.title,
                  jobId: conversation.jobApplication.job.id,
                }
              : null,
            otherParticipant:
              conversation.participants.find(p => p.userId !== userId)?.user || null,
          }
        : null,
      hasMore: messages.length === limit,
    };
  }

  /**
   * Send a message in a conversation (verify sender is participant).
   */
  async sendMessage(conversationId: string, senderId: string, content: string) {
    if (!content || !content.trim()) {
      throw new BadRequestException('Message content cannot be empty');
    }

    // Verify sender is a participant
    const participant = await prisma.conversationParticipant.findUnique({
      where: {
        conversationId_userId: { conversationId, userId: senderId },
      },
    });

    if (!participant) {
      throw new ForbiddenException('You are not a participant in this conversation');
    }

    const message = await prisma.message.create({
      data: {
        conversationId,
        senderId,
        content: content.trim(),
      },
      include: {
        sender: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            avatarUrl: true,
            userType: true,
          },
        },
      },
    });

    // Update conversation updatedAt
    await prisma.conversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    });

    return message;
  }

  /**
   * Get total unread messages across all conversations for a user.
   */
  async getUnreadTotal(userId: string) {
    const participants = await prisma.conversationParticipant.findMany({
      where: { userId },
      select: { conversationId: true, lastReadAt: true },
    });

    let total = 0;
    for (const p of participants) {
      const count = await prisma.message.count({
        where: {
          conversationId: p.conversationId,
          senderId: { not: userId },
          ...(p.lastReadAt ? { createdAt: { gt: p.lastReadAt } } : {}),
        },
      });
      total += count;
    }

    return { unreadCount: total };
  }

  /**
   * Mark a conversation as read (update lastReadAt to now).
   */
  async markConversationRead(conversationId: string, userId: string) {
    const participant = await prisma.conversationParticipant.findUnique({
      where: {
        conversationId_userId: { conversationId, userId },
      },
    });

    if (!participant) {
      throw new ForbiddenException('You are not a participant in this conversation');
    }

    await prisma.conversationParticipant.update({
      where: { id: participant.id },
      data: { lastReadAt: new Date() },
    });

    return { success: true };
  }

  /**
   * Resolve a candidateProfileId to its userId.
   */
  async resolveUserIdFromCandidateProfile(candidateProfileId: string): Promise<string> {
    const profile = await prisma.candidateProfile.findUnique({
      where: { id: candidateProfileId },
      select: { userId: true },
    });

    if (!profile) {
      throw new NotFoundException('Candidate profile not found');
    }

    return profile.userId;
  }
}
