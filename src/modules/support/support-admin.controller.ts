import { ApiPaginatedResponse } from '../../common/paginated-response';
import { SupportListQuery } from '../../common/dto/list-query.dto';
import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import type { SupportMessage } from '@prisma/client';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SendSupportMessageDto } from './dto/support.dto';
import { SupportAgentGuard } from './support-agent.guard';
import { SupportService } from './support.service';

@ApiTags('Support agent')
@ApiHeader({ name: 'X-Support-Key', required: true })
@UseGuards(SupportAgentGuard)
@Controller('support/admin/conversations')
export class SupportAdminController {
  constructor(private readonly support: SupportService) {}

  @Get()
  @ApiOperation({ summary: 'List conversations for the support team' })
  @ApiPaginatedResponse()
  list(@Query() query: SupportListQuery): ReturnType<SupportService['adminListPage']> {
    return this.support.adminListPage(query);
  }

  @Post(':id/messages')
  @ApiOperation({ summary: 'Reply to a customer and create an in-app notification' })
  reply(@Param('id') id: string, @Body() dto: SendSupportMessageDto): Promise<SupportMessage> {
    return this.support.reply(id, dto);
  }
}
