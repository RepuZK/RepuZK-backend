import { ArgumentsHost, BadRequestException, HttpStatus } from '@nestjs/common';
import { GlobalExceptionFilter } from './global-exception.filter';

function buildHost(url = '/api/proof/generate') {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const response = { status };
  const request = { method: 'POST', url };

  const host = {
    switchToHttp: () => ({
      getResponse: () => response,
      getRequest: () => request,
    }),
  } as unknown as ArgumentsHost;

  return { host, status, json };
}

describe('GlobalExceptionFilter', () => {
  let filter: GlobalExceptionFilter;

  beforeEach(() => {
    filter = new GlobalExceptionFilter();
  });

  it('maps an HttpException to its own status and message', () => {
    const { host, status, json } = buildHost();

    filter.catch(new BadRequestException('credentialId is required'), host);

    expect(status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'credentialId is required',
        path: '/api/proof/generate',
      }),
    );
  });

  it('preserves a validation pipe message array', () => {
    const { host, json } = buildHost();
    const messages = ['circuitName must be a string', 'credentialId should not be empty'];

    filter.catch(new BadRequestException(messages), host);

    expect(json).toHaveBeenCalledWith(expect.objectContaining({ message: messages }));
  });

  it('maps an unknown thrown value to 500 without leaking internals', () => {
    const { host, status, json } = buildHost();

    filter.catch(new Error('connection refused: postgres:5432'), host);

    expect(status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 500, message: 'Internal server error' }),
    );
  });

  it('always includes an ISO timestamp', () => {
    const { host, json } = buildHost();

    filter.catch(new BadRequestException('bad'), host);

    const [[body]] = json.mock.calls;
    expect(() => new Date(body.timestamp).toISOString()).not.toThrow();
  });
});
