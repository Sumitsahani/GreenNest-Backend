import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import type { SupportConversation, SupportMessage } from '@prisma/client';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, type AuthenticatedUser } from '../../common/auth/authenticated-user';
import { SupabaseAuthGuard } from '../../common/auth/supabase-auth.guard';
import {
  CloseSupportConversationDto,
  CreateSupportConversationDto,
  SendSupportMessageDto,
} from './dto/support.dto';
import { SupportService, type SupportConversationResponse } from './support.service';

@ApiTags('Support chat')
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard)
@Controller('support/conversations')
export class SupportController {
  constructor(private readonly support: SupportService) {}

  @Get()
  @ApiOperation({ summary: 'List the current user support conversations' })
  list(@CurrentUser() user: AuthenticatedUser): Promise<SupportConversation[]> {
    return this.support.list(user.id);
  }

  @Post()
  @ApiOperation({ summary: 'Start a persistent support conversation' })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateSupportConversationDto,
  ): Promise<SupportConversationResponse> {
    return this.support.create(user.id, dto);
  }

  @Get(':id/messages')
  @ApiOperation({ summary: 'Read messages and mark support replies as read' })
  messages(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<SupportMessage[]> {
    return this.support.messages(user.id, id);
  }

  @Post(':id/messages')
  @ApiOperation({ summary: 'Send a message to GreenNest support' })
  send(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: SendSupportMessageDto,
  ): Promise<SupportMessage> {
    return this.support.send(user.id, id, dto);
  }

  @Patch(':id/close')
  close(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CloseSupportConversationDto,
  ): Promise<SupportConversation> {
    return this.support.close(user.id, id, dto);
  }

  @Patch(':id/reopen')
  reopen(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<SupportConversation> {
    return this.support.reopen(user.id, id);
  }
}
