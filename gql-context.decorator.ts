import { createParamDecorator, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import z from 'zod';
import { getContextRequest } from '@/access-control/guards/auth.guard';
import { IncomingHttpHeaders } from 'http';
import { ExtendedRequest } from '../interfaces/extended-request.interface';
import { GqlModuleContext } from '../interfaces/gql-module-context.interface';
import { Role, User } from '@/users/entities/user.entity';
import { hasOneOfTheRoles, RolesCustomerAdmin } from '../enums';

export type AuthUser = Omit<User, 'id'> & { isCustomersAdmin: boolean; sessionId: string };
export type AuthPatient = { patientId: number; code: string; token: string };
export type AuthActor = { user: AuthUser; patient: null } | { user: null; patient: AuthPatient };

export type IGqlContext = {
    lang: string;
    windowId?: string;
    pathname: string;
} & AuthActor;

export function getExtendedRequestAuthContext(req: ExtendedRequest) {
    // for subscriptions, to separate one tab from another
    const windowId = z.string().optional().parse(req.connectionParams?.windowId);
    const lang = getLang(req.headers);
    const pathname = getPathname(req.headers);

    const context = { lang, pathname, windowId };

    if (req.user) {
        const sessionId: string = req.sessionId ?? '';
        const user: AuthUser = { ...req.user, sessionId, isCustomersAdmin: isCustomersAdmin(req.user) };
        return { ...context, user, patient: null };
    }
    if (req.patient) {
        return { ...context, user: null, patient: req.patient };
    }
}

function isCustomersAdmin(user: { roles: Role[] } | undefined) {
    if (!user) return false;
    return hasOneOfTheRoles(user.roles, RolesCustomerAdmin);
}

export function getAuthContext(ctx: ExecutionContext): IGqlContext {
    const req = getContextRequest(ctx);
    const extContext = getExtendedRequestAuthContext(req);
    if (!extContext?.user && !extContext?.patient) {
        throw new Error('Either user or patient must be non-null.');
    }
    return extContext;
}

export function getContextUser(ctx: ExecutionContext): AuthUser {
    const { user } = getAuthContext(ctx);
    if (!user) throw new UnauthorizedException('User is not authenticated');
    return user;
}

// get the authenticated user via the context value in GraphQLModule when using request-scoped provider
// here we may usually use it the the loaders
export function getGqlModuleContextUser(ctx: GqlModuleContext) {
    const extContext = getExtendedRequestAuthContext(ctx.req);
    if (!extContext?.user) throw new UnauthorizedException('User is not authenticated');

    return extContext.user;
}

export function getContextPatient(ctx: ExecutionContext): AuthPatient {
    const { patient } = getAuthContext(ctx);
    if (!patient) throw new UnauthorizedException('Patient is not authenticated');
    return patient;
}

export const ContextUser = createParamDecorator((data: unknown, ctx: ExecutionContext) =>
    getContextUser(ctx),
);

export const ContextPatient = createParamDecorator((data: unknown, ctx: ExecutionContext) =>
    getContextPatient(ctx),
);

export const GqlContext = createParamDecorator((data: unknown, ctx: ExecutionContext) =>
    getAuthContext(ctx),
);

function getPathname(headers: IncomingHttpHeaders): string {
    const pageUrl: string = (headers?.['x-page-url'] as string) ?? '';
    const baseUrl: string = headers['origin'] ?? '';

    return pageUrl.replace(baseUrl, '');
}

function getLang(headers: IncomingHttpHeaders) {
    return z
        .enum(['en', 'no'])
        .catch('no')
        .parse(headers['accept-language'] ?? '');
}
