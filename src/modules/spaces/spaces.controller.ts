import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, type AuthenticatedUser } from '../../common/auth/authenticated-user';
import { SupabaseAuthGuard } from '../../common/auth/supabase-auth.guard';
import { AnalyzeSpaceDto, RecommendPlantsDto } from './dto/spaces.dto';
import { PlantMatchingService } from './plant-matching.service';
import { SpacesService } from './spaces.service';
import { SpaceDesignsService } from './space-designs.service';
import { CreateDesignDto } from './dto/designs.dto';
import { DesignImagesService } from './design-images.service';

@ApiTags('Space Intelligence')
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard)
@Controller('spaces')
export class SpacesController {
  constructor(
    private readonly spaces: SpacesService,
    private readonly matching: PlantMatchingService,
    private readonly designs: SpaceDesignsService,
    private readonly images: DesignImagesService,
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

  @Post(':id/designs')
  createDesign(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateDesignDto,
  ): ReturnType<SpaceDesignsService['create']> {
    return this.designs.create(user.id, id, dto);
  }

  @Get(':id/designs')
  listDesigns(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): ReturnType<SpaceDesignsService['list']> {
    return this.designs.list(user.id, id);
  }

  @Get(':id/designs/:designId')
  designDetail(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('designId', ParseUUIDPipe) designId: string,
  ): ReturnType<SpaceDesignsService['detail']> {
    return this.designs.detail(user.id, id, designId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Load one saved SpaceScene' })
  detail(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): ReturnType<SpacesService['detail']> {
    return this.spaces.detail(user.id, id);
  }

  @Post(':id/designs/:designId/image')
  @ApiOperation({ summary: 'Generate and privately save a realistic room image from a design' })
  generateImage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('designId', ParseUUIDPipe) designId: string,
    @Headers('authorization') authorization: string,
  ): ReturnType<DesignImagesService['generate']> {
    return this.images.generate(user.id, id, designId, authorization);
  }

  @Get(':id/designs/:designId/image')
  @ApiOperation({ summary: 'Read image status and sign an existing image without regenerating it' })
  imageStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('designId', ParseUUIDPipe) designId: string,
    @Headers('authorization') authorization: string,
  ): ReturnType<DesignImagesService['status']> {
    return this.images.status(user.id, id, designId, authorization);
  }
}
