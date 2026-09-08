import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, type AuthenticatedUser } from '../../common/auth/authenticated-user';
import { SupabaseAuthGuard } from '../../common/auth/supabase-auth.guard';
import { AnalyzeSpaceDto, RecommendPlantsDto } from './dto/spaces.dto';
import { PlantMatchingService } from './plant-matching.service';
import { SpacesService } from './spaces.service';

@ApiTags('Space Intelligence')
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard)
@Controller('spaces')
export class SpacesController {
  constructor(
    private readonly spaces: SpacesService,
    private readonly matching: PlantMatchingService,
  ) {}

  @Post('analyze')
  @ApiOperation({ summary: 'Analyze and persist a private space photo' })
  analyze(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: AnalyzeSpaceDto,
  ): ReturnType<SpacesService['analyze']> {
    return this.spaces.analyze(user.id, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List the current user saved spaces' })
  list(@CurrentUser() user: AuthenticatedUser): ReturnType<SpacesService['list']> {
    return this.spaces.list(user.id);
  }

  @Post(':id/recommendations')
  @ApiOperation({ summary: 'Generate and persist suitable plant matches for a SpaceScene' })
  recommend(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: RecommendPlantsDto,
  ): ReturnType<PlantMatchingService['recommend']> {
    return this.matching.recommend(user.id, id, dto);
  }

  @Get(':id/recommendations')
  @ApiOperation({ summary: 'Reload persisted plant matches for a SpaceScene' })
  recommendations(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query() dto: RecommendPlantsDto,
  ): ReturnType<PlantMatchingService['list']> {
    return this.matching.list(user.id, id, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Load one saved SpaceScene' })
  detail(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): ReturnType<SpacesService['detail']> {
    return this.spaces.detail(user.id, id);
  }
}
