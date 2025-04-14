import { fetchLoggedInUserInfo } from '@/app/[lang]/auth.server';
import { NextRequest, NextFetchEvent, NextResponse } from 'next/server';

import { authLoggedUserQuery$data } from '@/app/[lang]/__generated__/authLoggedUserQuery.graphql';

import { Lang } from '@/i18n';

import { isUser } from '@/utils/type-guards.util';
import { getLangPrefix, getRoutePathLang, removeLangPrefix } from '@/utils/routes';

import { getPatientSessionCookie, getUserSessionCookies, removeNonValidSessions } from './helpers';

export async function authenticateUserMiddleware(request: NextRequest, event: NextFetchEvent) {
    if (cookiesHasFetchedActor(request)) return;

    const [loggedUser, error] = await fetchLoggedInUserInfo(request.headers.get('cookie') || '');
    if (error) return;

    if (!loggedUser?.loggedUser?.me) {
        // invalidate session
        return clearSessionCookies();
    }

    return setActorCookies(loggedUser.loggedUser, request);
}

type ActorResponse = Exclude<authLoggedUserQuery$data['loggedUser'], null>;
type User = Extract<ActorResponse['me'], { __typename: 'User' }>;

function setActorCookies(loggedUser: ActorResponse, request: NextRequest) {
    const response = userNeedsLangRedirect(loggedUser, request)
        ? redirectToUserLang(loggedUser.me as User, request)
        : NextResponse.next();

    if (isUser(loggedUser.me)) {
        removeNonValidSessions(loggedUser, request, response);
        markSessionFetched(loggedUser.sessionId, response);
    }

    const meStr = JSON.stringify(loggedUser.me);

    // set cookie for logged actor
    request.cookies.set('logged-user', meStr);
    response.cookies.set('logged-user', meStr, {
        path: '/',
        httpOnly: false,
        secure: true,
        sameSite: 'lax',
    });

    // set auth token cookie, to simplify requests to the backend
    response.cookies.set('authToken', loggedUser.token, {
        path: '/',
        httpOnly: false,
        secure: true,
        sameSite: 'lax',
    });

    // because cookies will be available only in the next request,
    // need to set them in the header as well
    response.headers.set('logged-user', meStr);

    response.headers.set('authToken', loggedUser.token);
    return response;
}

// Flag in cookie that given session has been fetched
function markSessionFetched(userSessionId: string, response: NextResponse<unknown>) {
    const [sessionId, sessionValue] = userSessionId.split('=');

    response.cookies.set(`user-${sessionId}`, sessionValue, {
        path: '/',
        httpOnly: false,
        secure: true,
        sameSite: 'lax',
        // when expired, it forces to refetch logged user info.
        maxAge: 60,
    });
}

function cookiesHasFetchedActor(request: NextRequest) {
    const patientSessionCookie = getPatientSessionCookie(request);
    const userSessionCookies = getUserSessionCookies(request);

    if (userSessionCookies.length < 1 && !patientSessionCookie) return false;

    if (userSessionCookies.length === 1) {
        const sessionId = userSessionCookies[0];
        if (request.cookies.get(`user-${sessionId.name}`)?.value === sessionId.value) {
            // app has already fetched the user for this session, and it is stored in the cookie
            return true;
        }
    }

    return false;
}

function clearSessionCookies() {
    const response = NextResponse.next();

    // clear logged-user and authToken cookies and headers
    response.cookies.delete('logged-user');
    response.cookies.delete('authToken');
    response.headers.delete('logged-user');
    response.headers.delete('authToken');

    return response;
}

function userNeedsLangRedirect(actor: ActorResponse, request: NextRequest): boolean {
    if (!isUser(actor.me)) return false; // Only users have a preferred language

    const isNewUserSession = !request.cookies.get('logged-user');
    if (!isNewUserSession) return false;

    const { pathname } = request.nextUrl;
    const lang = getRoutePathLang(pathname);
    const preferredLang = actor.me.language === 'nb' ? 'no' : actor.me.language;

    return lang !== preferredLang;
}

function redirectToUserLang(user: User, request: NextRequest) {
    const { pathname } = request.nextUrl;
    const langPrefix = getLangPrefix(user.language === 'nb' ? 'no' : user.language);
    return NextResponse.redirect(new URL(`${langPrefix}${removeLangPrefix(pathname)}`, request.nextUrl));
}
