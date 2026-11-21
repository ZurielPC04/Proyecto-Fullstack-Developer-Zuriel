/**
 * design.md §2.1 y D-07: entrega del código de un solo uso. Se llama después del COMMIT de
 * la transferencia (§6.5), nunca con bloqueos tomados.
 */
export interface ProveedorOtp {
  enviar(usuarioId: string, codigo: string): Promise<{ codigoSimulado?: string }>;
}

/** Solo se instancia con OTP_SIMULADO=true: devuelve el código para `codigoSimulado` (R-6.17). */
export class ProveedorOtpSimulado implements ProveedorOtp {
  async enviar(_usuarioId: string, codigo: string): Promise<{ codigoSimulado: string }> {
    return { codigoSimulado: codigo };
  }
}

/**
 * §2.1: con OTP_SIMULADO=false mientras no exista un proveedor real (SMS o correo). Siempre
 * lanza; la API responde 500 y la transferencia queda pendiente hasta que expira (§6.5).
 * El error nunca lleva el código (R-6.16).
 */
export class ProveedorOtpNoConfigurado implements ProveedorOtp {
  async enviar(): Promise<never> {
    throw new Error('No hay un proveedor de OTP configurado (OTP_SIMULADO=false)');
  }
}

/** D-07: el simulado solo existe con OTP_SIMULADO=true; si no, el no configurado (§2.1). */
export function elegirProveedorOtp(config: { OTP_SIMULADO: boolean }): ProveedorOtp {
  return config.OTP_SIMULADO ? new ProveedorOtpSimulado() : new ProveedorOtpNoConfigurado();
}
