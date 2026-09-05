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

@ApiTags('Plant Intelligence')
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard)
@Controller()
export class IntelligenceController {
  constructor(private readonly intelligence: PlantIntelligenceService) {}

  @Get('garden/today')
  gardenToday(
    @CurrentUser() user: AuthenticatedUser,
    @Query('temperature') temperature?: string,
    @Query('humidity') humidity?: string,
  ): ReturnType<PlantIntelligenceService['gardenToday']> {
    return this.intelligence.gardenToday(user.id, {
      temperature: temperature === undefined ? undefined : Number(temperature),
      humidity: humidity === undefined ? undefined : Number(humidity),
    });
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
  recordEvent(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CreatePlantEventDto,
  ): ReturnType<PlantIntelligenceService['recordEvent']> {
    return this.intelligence.recordEvent(user.id, id, dto);
  }

  @Post('garden/plants/:id/photos')
  addPhoto(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: AddPlantPhotoDto,
  ): ReturnType<PlantIntelligenceService['addPhoto']> {
    return this.intelligence.addPhoto(user.id, id, dto);
  }

  @Patch('garden/plants/:id/lifecycle')
  lifecycle(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdatePlantLifecycleDto,
  ): ReturnType<PlantIntelligenceService['updateLifecycle']> {
    return this.intelligence.updateLifecycle(user.id, id, dto);
  }

  @Post('garden/plants/:id/outcomes')
  outcome(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: RecordPlantOutcomeDto,
  ): ReturnType<PlantIntelligenceService['recordOutcome']> {
    return this.intelligence.recordOutcome(user.id, id, dto);
  }

  @Post('recommendations/:id/action')
  recommendationAction(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: RecommendationResponseDto,
  ): ReturnType<PlantIntelligenceService['respondToRecommendation']> {
    return this.intelligence.respondToRecommendation(user.id, id, dto);
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
