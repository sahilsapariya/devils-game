import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';

import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedPrincipal } from '../auth/jwt.strategy';
import { UpdateUserDto } from './dto/update-user.dto';
import { serializeUser, type PublicUser } from './user.serializer';
import { UsersService } from './users.service';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  async getMe(@CurrentUser() principal: AuthenticatedPrincipal): Promise<PublicUser> {
    const user = await this.usersService.getById(principal.userId);
    return serializeUser(user);
  }

  @Patch('me')
  async updateMe(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Body() dto: UpdateUserDto,
  ): Promise<PublicUser> {
    const user = await this.usersService.updateById(principal.userId, dto);
    return serializeUser(user);
  }
}
