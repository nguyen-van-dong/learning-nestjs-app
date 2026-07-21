import { Controller, Get, Param, ParseIntPipe, Request, UseGuards } from "@nestjs/common";
import { UserService } from "./user.service";
import { AuthGuard } from "src/guards/auth.guard";

@Controller('users')
@UseGuards(AuthGuard)
export class UserController {

    constructor(private userService: UserService) {}

    @Get('me')
    me(@Request() req) {
        return req.user;
    }
}
