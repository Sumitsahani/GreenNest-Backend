import { ApiPaginatedResponse } from '../../common/paginated-response';
import { ListQueryDto } from '../../common/dto/list-query.dto';
import {
  Query,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { AiConversation, AiUserMemory } from '@prisma/client';
import { CurrentUser, type AuthenticatedUser } from '../../common/auth/authenticated-user';
import { SupabaseAuthGuard } from '../../common/auth/supabase-auth.guard';
import { AiMemoryService } from './ai-memory.service';
import { AiService } from './ai.service';
import {
  CreateConversationDto,
  GardenBriefingDto,
  IdentifyPlantDto,
  SendAiMessageDto,
  UpdateMemoryDto,
} from './dto/ai.dto';

@ApiTags('AI Assistant')
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard)
@Controller('ai')
export class AiController {
  constructor(
    private readonly ai: AiService,
    private readonly memories: AiMemoryService,
  ) {}

  @Post('identify-plant') identifyPlant(
    @Body() dto: IdentifyPlantDto,
  ): ReturnType<AiService['identifyPlant']> {
    return this.ai.identifyPlant(dto.imageUrl);
  }
  @Post('briefing') briefing(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: GardenBriefingDto,
  ): ReturnType<AiService['briefing']> {
    return this.ai.briefing(user.id, dto);
  }

  @Post('conversations') createConversation(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateConversationDto,
  ): Promise<AiConversation> {
    return this.ai.createConversation(user.id, dto);
  }
  @ApiPaginatedResponse()
  @Get('conversations')
  conversations(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListQueryDto,
  ): ReturnType<AiService['conversationsPage']> {
    return this.ai.conversationsPage(user.id, query);
  }
  @ApiPaginatedResponse()
  @Get('conversations/:id/messages')
  messages(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query() query: ListQueryDto,
  ): ReturnType<AiService['messagesPage']> {
    return this.ai.messagesPage(user.id, id, query);
  }
  @Post('conversations/:id/messages') send(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: SendAiMessageDto,
  ): ReturnType<AiService['send']> {
    return this.ai.send(user.id, id, dto);
  }
  @ApiPaginatedResponse()
  @Get('memories')
  listMemories(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListQueryDto,
  ): ReturnType<AiMemoryService['listPage']> {
    return this.memories.listPage(user.id, query);
  }
  @Patch('memories/:id') updateMemory(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateMemoryDto,
  ): Promise<AiUserMemory> {
    return this.memories.update(user.id, id, dto);
  }
  @Delete('memories/:id') deleteMemory(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<{ deleted: true }> {
    return this.memories.remove(user.id, id);
  }
}
