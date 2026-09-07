import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, type AuthenticatedUser } from '../../common/auth/authenticated-user';
import { SupabaseAuthGuard } from '../../common/auth/supabase-auth.guard';
import {
  AddPlantPhotoDto,
  AiFeedbackDto,
  CreatePlantEventDto,
  RecommendationResponseDto,
  RecordPlantOutcomeDto,
  UpdatePlantLifecycleDto,
} from './dto/intelligence.dto';
import { PlantIntelligenceService } from './plant-intelligence.service';
import { GardenIntelligenceService } from './garden-intelligence.service';
import { CareSessionService } from './care-session.service';
import {
  CompleteBatchCareDto,
  EngagementEventDto,
  RecoveryOutcomeDto,
} from './dto/garden-intelligence.dto';

@ApiTags('Plant Intelligence')
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard)
@Controller()
export class IntelligenceController {
  constructor(
    private readonly intelligence: PlantIntelligenceService,
    private readonly gardenIntelligence: GardenIntelligenceService,
    private readonly careSessions: CareSessionService,
  ) {}

  @Get('garden/today')
  gardenToday(
    @CurrentUser() user: AuthenticatedUser,
    @Query('temperature') temperature?: string,
    @Query('humidity') humidity?: string,
  ): ReturnType<GardenIntelligenceService['today']> {
    void temperature;
    void humidity;
    return this.gardenIntelligence.today(user.id);
  }

  @Get('garden/weekly-review')
  weeklyReview(
    @CurrentUser() user: AuthenticatedUser,
  ): ReturnType<GardenIntelligenceService['weeklyReview']> {
    return this.gardenIntelligence.weeklyReview(user.id);
  }

  @Post('garden/care-sessions')
  completeCareSession(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CompleteBatchCareDto,
  ): ReturnType<CareSessionService['complete']> {
    return this.careSessions.complete(user.id, dto);
  }

  @Post('garden/care-sessions/:id/undo')
  undoCareSession(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): ReturnType<CareSessionService['undo']> {
    return this.careSessions.undo(user.id, id);
  }

  @Post('garden/recovery-checkpoints/:id/complete')
  completeRecovery(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: RecoveryOutcomeDto,
  ): ReturnType<GardenIntelligenceService['completeRecoveryCheckpoint']> {
    return this.gardenIntelligence.completeRecoveryCheckpoint(user.id, id, dto);
  }

  @Post('engagement/events')
  engagement(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: EngagementEventDto,
  ): ReturnType<CareSessionService['recordEngagement']> {
    return this.careSessions.recordEngagement(user.id, dto.name, dto.properties);
  }

  @Get('garden/plants/:id/intelligence')
  plantIntelligence(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): ReturnType<PlantIntelligenceService['intelligence']> {
    return this.intelligence.intelligence(user.id, id);
  }

  @Get('garden/plants/:id/memory')
  plantMemory(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): ReturnType<PlantIntelligenceService['memories']> {
    return this.intelligence.memories(user.id, id);
  }

  @Post('garden/plants/:id/events')
  async recordEvent(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CreatePlantEventDto,
  ): ReturnType<PlantIntelligenceService['recordEvent']> {
    const result = await this.intelligence.recordEvent(user.id, id, dto);
    this.gardenIntelligence.invalidate(user.id);
    return result;
  }

  @Post('garden/plants/:id/photos')
  async addPhoto(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: AddPlantPhotoDto,
  ): ReturnType<PlantIntelligenceService['addPhoto']> {
    const result = await this.intelligence.addPhoto(user.id, id, dto);
    this.gardenIntelligence.invalidate(user.id);
    return result;
  }

  @Patch('garden/plants/:id/lifecycle')
  async lifecycle(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdatePlantLifecycleDto,
  ): ReturnType<PlantIntelligenceService['updateLifecycle']> {
    const result = await this.intelligence.updateLifecycle(user.id, id, dto);
    this.gardenIntelligence.invalidate(user.id);
    return result;
  }

  @Post('garden/plants/:id/outcomes')
  async outcome(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: RecordPlantOutcomeDto,
  ): ReturnType<PlantIntelligenceService['recordOutcome']> {
    const result = await this.intelligence.recordOutcome(user.id, id, dto);
    this.gardenIntelligence.invalidate(user.id);
    return result;
  }

  @Post('recommendations/:id/action')
  async recommendationAction(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: RecommendationResponseDto,
  ): ReturnType<PlantIntelligenceService['respondToRecommendation']> {
    const result = await this.intelligence.respondToRecommendation(user.id, id, dto);
    this.gardenIntelligence.invalidate(user.id);
    return result;
  }

  @Get('users/me/gardening-profile')
  profile(
    @CurrentUser() user: AuthenticatedUser,
  ): ReturnType<PlantIntelligenceService['gardeningProfile']> {
    return this.intelligence.gardeningProfile(user.id);
  }

  @Post('ai/feedback')
  feedback(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: AiFeedbackDto,
  ): ReturnType<PlantIntelligenceService['feedback']> {
    return this.intelligence.feedback(user.id, dto);
  }
}
