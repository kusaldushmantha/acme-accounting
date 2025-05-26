import { Body, Controller, Get, Post } from '@nestjs/common';
import { TicketsService } from './tickets.service';
import { Ticket } from '../../db/models/Ticket';
import { Company } from '../../db/models/Company';
import { User } from '../../db/models/User';
import { NewTicketDto } from './dto';

@Controller('api/v1/tickets')
export class TicketsController {
  constructor(private readonly ticketService: TicketsService) {}

  @Get()
  async findAll() {
    return await Ticket.findAll({ include: [Company, User] });
  }

  @Post()
  async create(@Body() dto: NewTicketDto) {
    return await this.ticketService.createTicket(dto);
  }
}
