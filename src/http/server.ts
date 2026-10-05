import { createServer as createHttpServer } from 'node:http';
import { assessmentService } from '../application/assessment-service.ts';
import { DomainError } from '../domain/errors.ts';

const MAX_BODY_BYTES = 2 * 1024 * 1024;
async function body(request: import('node:http').IncomingMessage): Promise<any> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_BODY_BYTES) throw new DomainError('REQUEST_TOO_LARGE', 'JSON request exceeds the 2 MiB service limit', 413);
    chunks.push(buffer);
  }
  if (!size) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new DomainError('INVALID_JSON', 'Request body must be valid JSON', 400); }
}
function send(response: import('node:http').ServerResponse, status: number, payload: unknown): void {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  response.end(JSON.stringify(payload));
}

export function createServer() {
  return createHttpServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? '/', 'http://127.0.0.1');
      if (request.method === 'GET' && url.pathname === '/health') return send(response, 200, { status: 'ok', service: 'salt-cavern-hydrogen-integrity-engine' });
      if (request.method !== 'POST') return send(response, 405, { error: { code: 'METHOD_NOT_ALLOWED', message: 'Use POST for calculation endpoints' } });
      const input = await body(request);
      const routes: Record<string, () => unknown> = {
        '/v1/inventory/transfer': () => assessmentService.inventory(input.transfers ?? []),
        '/v1/inventory/reconcile': () => assessmentService.reconcile(input.expected, input.observed, input.absoluteToleranceMol, input.relativeTolerance),
        '/v1/dispatch/simulate': () => assessmentService.dispatch(input.initial, input.steps ?? [], input.limits),
        '/v1/wellbore/evaluate': () => assessmentService.wellbore(input.segments ?? [], input.surfacePressureKpa, input.ambientTemperatureK, input.shutInHours),
        '/v1/monitoring/correct': () => assessmentService.monitoring(input.sample, input.calibrations ?? [], input.rawUncertainty),
        '/v1/leak/fuse': () => assessmentService.leak(input.evidence ?? [], input.priorProbability),
        '/v1/purity/withdraw': () => assessmentService.purity(input.layers ?? [], input.withdrawals ?? [], input.minimumManifoldPurity),
        '/v1/uncertainty/sample': () => assessmentService.uncertainty(input),
        '/v1/cavern/geometry': () => assessmentService.geometry(input.points ?? [], input.depthM, input.targetVolumeM3),
        '/v1/geomechanics/history': () => assessmentService.geomechanics(input.intervals ?? [], input.parameters, input.initial, input.baseMinKpa, input.baseMaxKpa),
        '/v1/facility/allocate': () => assessmentService.facility(input.requests ?? [], input.stationCapacityMolPerSecond, input.horizonHours),
        '/v1/gas/state': () => assessmentService.gasState(input.totalMoles, input.volumeM3, input.temperatureK, input.composition),
      };
      const handler = routes[url.pathname];
      if (!handler) return send(response, 404, { error: { code: 'NOT_FOUND', message: 'Unknown calculation endpoint' } });
      return send(response, 200, handler());
    } catch (error) {
      const domain = error instanceof DomainError ? error : new DomainError('INTERNAL_ERROR', error instanceof Error ? error.message : 'Unknown error', 500);
      return send(response, domain.status, { error: { code: domain.code, message: domain.message, details: domain.details } });
    }
  });
}

if (process.argv[1] && new URL(import.meta.url).pathname === process.argv[1]) {
  const port = Number(process.env.PORT ?? 4317);
  createServer().listen(port, '127.0.0.1', () => console.log(`salt-cavern service listening on http://127.0.0.1:${port}`));
}
