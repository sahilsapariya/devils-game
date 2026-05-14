import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { UserEntity } from '../../database/entities/user.entity';
import type { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly users: Repository<UserEntity>,
  ) {}

  async findById(id: string): Promise<UserEntity | null> {
    return this.users.findOne({ where: { id } });
  }

  async getById(id: string): Promise<UserEntity> {
    const user = await this.findById(id);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  async updateById(id: string, dto: UpdateUserDto): Promise<UserEntity> {
    const user = await this.getById(id);

    if (dto.displayName !== undefined) {
      user.displayName = dto.displayName;
    }
    if (dto.preferences !== undefined) {
      user.preferences = { ...user.preferences, ...dto.preferences };
    }
    if (dto.isActive !== undefined) {
      user.isActive = dto.isActive;
    }

    return this.users.save(user);
  }
}
