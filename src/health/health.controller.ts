import { Controller, Get, HttpStatus, Param } from '@nestjs/common';
import { ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ErrorCode } from '../common/constants/error-code';
import { BusinessException } from '../common/exceptions/business.exception';
import {
  ErrorEnvelopeDto,
  HealthSuccessEnvelopeDto,
  type HealthResponseDto,
} from './dto/health-response.dto';
import { HealthService } from './health.service';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @ApiOperation({ summary: 'Check API readiness and database connection state' })
  @ApiOkResponse({ type: HealthSuccessEnvelopeDto })
  getHealth(): HealthResponseDto {
    return this.healthService.getHealth();
  }

  @Get(':component')
  @ApiOperation({ summary: 'Check a named platform component' })
  @ApiOkResponse({ type: HealthSuccessEnvelopeDto })
  @ApiNotFoundResponse({ type: ErrorEnvelopeDto, description: 'NOT_FOUND' })
  getComponent(@Param('component') component: string): HealthResponseDto {
    if (!['api', 'database'].includes(component)) {
      throw new BusinessException(
        ErrorCode.NOT_FOUND,
        'The requested component was not found',
        HttpStatus.NOT_FOUND,
        { field: 'component', details: { component } },
      );
    }
    return this.healthService.getHealth();
  }
}
