import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { InjectConnection } from '@nestjs/sequelize';
import { Op, Sequelize } from 'sequelize';
import {
  Ticket,
  TicketCategory,
  TicketStatus,
  TicketType,
} from '../../db/models/Ticket';
import { User, UserRole } from '../../db/models/User';
import { NewTicketDto, TicketDto } from './dto';

@Injectable()
export class TicketsService {
  private readonly logger = new Logger(TicketsService.name);

  constructor(@InjectConnection() private readonly sequelize: Sequelize) {}

  private determineCategory(type: TicketType): TicketCategory {
    switch (type) {
      case TicketType.managementReport:
        return TicketCategory.accounting;
      case TicketType.registrationAddressChange:
        return TicketCategory.corporate;
      case TicketType.strikeOff:
        return TicketCategory.management;
      default:
        throw new BadRequestException(`Cannot determine the ticket category`);
    }
  }

  private async findAssignee(
    type: TicketType,
    companyId: number,
  ): Promise<User> {
    let userRole: UserRole;
    let assignees: User[];

    if (type === TicketType.managementReport) {
      userRole = UserRole.accountant;
      assignees = await User.findAll({
        where: { companyId, role: userRole },
        order: [['createdAt', 'DESC']],
      });
    } else if (type === TicketType.strikeOff) {
      userRole = UserRole.director;
      assignees = await User.findAll({ where: { companyId, role: userRole } });
      if (assignees.length > 1)
        throw new ConflictException(
          `Multiple directors found for strikeOff ticket.`,
        );
    } else {
      userRole = UserRole.corporateSecretary;
      assignees = await User.findAll({ where: { companyId, role: userRole } });

      if (assignees.length > 1)
        throw new ConflictException(`Multiple corporate secretaries found`);

      if (assignees.length === 0) {
        userRole = UserRole.director;
        assignees = await User.findAll({
          where: { companyId, role: userRole },
        });
        if (assignees.length > 1)
          throw new ConflictException(`Multiple fallback directors found.`);
      }
    }

    if (!assignees.length)
      throw new ConflictException(`No assignee found for ticket type ${type}`);

    return assignees[0];
  }

  async createTicket(dto: NewTicketDto): Promise<TicketDto> {
    const { type, companyId } = dto;

    // A company should have only one ticket of type registrationAddressChange
    if (type === TicketType.registrationAddressChange) {
      const existing = await Ticket.findOne({ where: { companyId, type } });
      if (existing)
        throw new ConflictException(
          `Company ${companyId} already has a ${type} ticket.`,
        );
    }

    const category = this.determineCategory(type);
    const assignee = await this.findAssignee(type, companyId);

    // Strike off type should be created within a transaction block after updating other ticket statuses
    if (type === TicketType.strikeOff) {
      const transaction = await this.sequelize.transaction();
      try {
        await Ticket.update(
          { status: TicketStatus.resolved },
          {
            where: { companyId, type: { [Op.ne]: TicketType.strikeOff } },
            transaction,
          },
        );

        const ticket = await Ticket.create(
          {
            companyId,
            assigneeId: assignee.id,
            category,
            type,
            status: TicketStatus.open,
          },
          { transaction },
        );

        await transaction.commit();

        return {
          id: ticket.id,
          type: ticket.type,
          assigneeId: ticket.assigneeId,
          status: ticket.status,
          category: ticket.category,
          companyId: ticket.companyId,
        };
      } catch (error) {
        this.logger.error(
          `Error in strikeOff creation for company ${companyId}`,
          error,
        );
        await transaction.rollback();
        throw new InternalServerErrorException(error);
      }
    }

    const ticket = await Ticket.create({
      companyId,
      assigneeId: assignee.id,
      category,
      type,
      status: TicketStatus.open,
    });

    return {
      id: ticket.id,
      type: ticket.type,
      assigneeId: ticket.assigneeId,
      status: ticket.status,
      category: ticket.category,
      companyId: ticket.companyId,
    };
  }
}
