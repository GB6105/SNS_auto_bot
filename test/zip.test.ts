import { test } from "node:test";
import assert from "node:assert/strict";
import { zipStore } from "../src/util/zip.js";

test("zipStore — 유효한 ZIP 구조(로컬 헤더·EOCD 시그니처·레코드 수)", () => {
  const a = new Uint8Array([1, 2, 3, 4, 5]);
  const b = new Uint8Array([9, 9, 9]);
  const zip = zipStore([
    { name: "a.png", data: a },
    { name: "b.png", data: b },
  ]);

  // 첫 4바이트 = 로컬 파일 헤더 시그니처 PK\x03\x04
  assert.deepEqual([...zip.slice(0, 4)], [0x50, 0x4b, 0x03, 0x04]);

  // 마지막 22바이트 = EOCD (시그니처 PK\x05\x06 + 레코드 수 2)
  const eocd = zip.slice(zip.length - 22);
  assert.deepEqual([...eocd.slice(0, 4)], [0x50, 0x4b, 0x05, 0x06]);
  const totalRecords = eocd[10] | (eocd[11] << 8);
  assert.equal(totalRecords, 2, "총 엔트리 2개");

  // 데이터 바이트가 그대로 들어있다(store/무압축)
  assert.ok(zip.includes(9), "b.png 데이터 포함");
});

test("zipStore — 빈 목록도 유효한 EOCD", () => {
  const zip = zipStore([]);
  assert.equal(zip.length, 22);
  assert.deepEqual([...zip.slice(0, 4)], [0x50, 0x4b, 0x05, 0x06]);
});
