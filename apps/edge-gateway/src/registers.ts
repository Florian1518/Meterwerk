import Decimal from "decimal.js";
import type { RegisterDefinition } from "../../../src/lib/modbus/contracts";
export class ModbusError extends Error {
  constructor(
    public code:
      | "TIMEOUT"
      | "WRONG_SLAVE"
      | "DISCONNECTED"
      | "INVALID_REGISTER"
      | "UNREALISTIC"
      | "CRC"
      | "COMMUNICATION"
      | "PROFILE"
      | "ENDPOINT_NOT_ALLOWED",
  ) {
    super(code);
  }
}
export function decodeRegister(input: Buffer, r: RegisterDefinition) {
  if (input.length !== r.length * 2) throw new ModbusError("COMMUNICATION");
  let words = Array.from({ length: r.length }, (_, i) =>
    Buffer.from(input.subarray(i * 2, i * 2 + 2)),
  );
  if (r.byteOrder === "LE") words = words.map((w) => Buffer.from([w[1], w[0]]));
  if (r.wordOrder === "LE") words.reverse();
  const b = Buffer.concat(words);
  let raw: string;
  switch (r.dataType) {
    case "uint16":
      raw = b.readUInt16BE().toString();
      break;
    case "int16":
      raw = b.readInt16BE().toString();
      break;
    case "uint32":
      raw = b.readUInt32BE().toString();
      break;
    case "int32":
      raw = b.readInt32BE().toString();
      break;
    case "uint64":
      raw = b.readBigUInt64BE().toString();
      break;
    case "int64":
      raw = b.readBigInt64BE().toString();
      break;
    case "float32":
      raw = b.readFloatBE().toString();
      break;
    case "float64":
      raw = b.readDoubleBE().toString();
      break;
  }
  const value = new Decimal(raw).mul(r.scale);
  if (!value.isFinite() || value.lt(r.min) || value.gt(r.max))
    throw new ModbusError("UNREALISTIC");
  return value.toFixed(6);
}
export function crc16(buffer: Buffer) {
  let crc = 0xffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++)
      crc = crc & 1 ? (crc >>> 1) ^ 0xa001 : crc >>> 1;
  }
  return crc;
}
export function validateResponse(
  buffer: Buffer,
  slaveId: number,
  functionCode: number,
  length: number,
  rtu = false,
) {
  if (rtu) {
    if (
      buffer.length < 5 ||
      crc16(buffer.subarray(0, -2)) !== buffer.readUInt16LE(buffer.length - 2)
    )
      throw new ModbusError("CRC");
    buffer = buffer.subarray(0, -2);
  }
  if (buffer[0] !== slaveId) throw new ModbusError("WRONG_SLAVE");
  if (buffer[1] === (functionCode | 0x80))
    throw new ModbusError(
      buffer[2] === 2 ? "INVALID_REGISTER" : "COMMUNICATION",
    );
  if (
    buffer[1] !== functionCode ||
    buffer[2] !== length * 2 ||
    buffer.length !== 3 + length * 2
  )
    throw new ModbusError("COMMUNICATION");
  return buffer.subarray(3);
}
