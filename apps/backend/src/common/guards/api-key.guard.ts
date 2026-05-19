import {
  CanActivate,
  ExecutionContext,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { IS_PUBLIC_KEY } from '../decorators/public.decorator'

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ])

    if (isPublic) {
      return true
    }

    const configuredApiKey = process.env.API_KEY

    if (!configuredApiKey) {
      throw new InternalServerErrorException(
        'API_KEY não configurada no ambiente.',
      )
    }

    const request = context.switchToHttp().getRequest()
    const providedApiKey = request.headers['x-api-key']

    if (
      typeof providedApiKey !== 'string' ||
      providedApiKey !== configuredApiKey
    ) {
      throw new UnauthorizedException('Chave de acesso inválida.')
    }

    return true
  }
}
