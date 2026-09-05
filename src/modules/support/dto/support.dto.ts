import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SupportConversationStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString, Length, MaxLength } from 'class-validator';

export class CreateSupportConversationDto {
  @ApiPropertyOptional({ example: 'Plant care help' })
  @IsOptional()
  @IsString()
  @Length(2, 120)
  subject?: string;

  @ApiProperty({ example: 'My plant leaves are turning yellow.' })
  @IsString()
  @Length(2, 2000)
  message!: string;
}

export class SendSupportMessageDto {
  @ApiProperty()
  @IsString()
  @Length(1, 2000)
  message!: string;
}

export class CloseSupportConversationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;
}

export class SupportAdminQueryDto {
  @ApiPropertyOptional({ enum: SupportConversationStatus })
  @IsOptional()
  @IsEnum(SupportConversationStatus)
  status?: SupportConversationStatus;
}
