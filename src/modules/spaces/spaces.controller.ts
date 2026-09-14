import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, type AuthenticatedUser } from '../../common/auth/authenticated-user';
import { SupabaseAuthGuard } from '../../common/auth/supabase-auth.guard';
import { AnalyzeSpaceDto } from './dto/spaces.dto';
import { SpacesService } from './spaces.service';

@ApiTags('Space Intelligence')
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard)
@Controller('spaces')
export class SpacesController {
  constructor(private readonly spaces: SpacesService) {}

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

  @Get(':id')
  @ApiOperation({ summary: 'Load one saved SpaceScene' })
  detail(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): ReturnType<SpacesService['detail']> {
    return this.spaces.detail(user.id, id);
  }
}
