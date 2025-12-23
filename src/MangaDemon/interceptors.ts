import { PaperbackInterceptor, type Request, type Response } from '@paperback/types';
import { generateBrowserHeaders } from '../MangaPark/browserHeaders';

export class Interceptor extends PaperbackInterceptor {
    constructor(id: string) {
        super(id);
    }

    override async interceptRequest(request: Request): Promise<Request> {
        const headers = generateBrowserHeaders(request.url);
        request.headers = { ...headers, ...request.headers };
        return request;
    }

    override async interceptResponse(
        _request: Request,
        _response: Response,
        data: ArrayBuffer
    ): Promise<ArrayBuffer> {
        return data;
    }
}
