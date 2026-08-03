import { Controller, Get, Param, ParseIntPipe, Request, UseGuards } from "@nestjs/common";
import { UserService } from "./user.service";
import { AuthGuard } from "src/guards/auth.guard";

@Controller('users')
@UseGuards(AuthGuard)
export class UserController {

    constructor(private userService: UserService) {}

    @Get('me')
    async me(@Request() req) {
        const user = req.user;
        if (!user) {
            return null;
        }
        return {
            message: 'User retrieved successfully',
            data: await this.userService.findById(user.id),
        }
    }
}
