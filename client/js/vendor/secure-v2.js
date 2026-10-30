var SeruchatV2 = (() => {
  var __create = Object.create;
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __getProtoOf = Object.getPrototypeOf;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
    get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
  }) : x)(function(x) {
    if (typeof require !== "undefined") return require.apply(this, arguments);
    throw Error('Dynamic require of "' + x + '" is not supported');
  });
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toESM = (mod2, isNodeMode, target) => (target = mod2 != null ? __create(__getProtoOf(mod2)) : {}, __copyProps(
    // If the importer is in node compatibility mode or this is not an ESM
    // file that has been converted to a CommonJS file using a Babel-
    // compatible transform (i.e. "__esModule" has not been set), then set
    // "default" to the CommonJS "module.exports" for node compatibility.
    isNodeMode || !mod2 || !mod2.__esModule ? __defProp(target, "default", { value: mod2, enumerable: true }) : target,
    mod2
  ));
  var __toCommonJS = (mod2) => __copyProps(__defProp({}, "__esModule", { value: true }), mod2);

  // src/crypto/secure-v2.mjs
  var secure_v2_exports = {};
  __export(secure_v2_exports, {
    MAX_MEMBERS: () => MAX_MEMBERS,
    SUITE: () => SUITE,
    b64: () => b64,
    canonical: () => canonical,
    digest: () => digest,
    directContext: () => directContext,
    encode: () => encode,
    eventHash: () => eventHash,
    exact: () => exact,
    groupContext: () => groupContext,
    header: () => header,
    identityProof: () => identityProof,
    importPublic: () => importPublic,
    memberIdentity: () => memberIdentity,
    openEnvelope: () => openEnvelope,
    openFile: () => openFile,
    public64: () => public64,
    restoreIdentity: () => restoreIdentity,
    rosterDocument: () => rosterDocument,
    sealFile: () => sealFile,
    sealText: () => sealText,
    sign: () => sign,
    signedEvent: () => signedEvent,
    un64: () => un64,
    uuid: () => uuid,
    validateEvent: () => validateEvent,
    validateHeader: () => validateHeader,
    validateIdentity: () => validateIdentity,
    validateInvitation: () => validateInvitation,
    verify: () => verify,
    verifyChain: () => verifyChain,
    verifyEnvelope: () => verifyEnvelope
  });

  // node_modules/@hpke/common/esm/src/errors.js
  var HpkeError = class extends Error {
    constructor(e) {
      let message;
      if (e instanceof Error) {
        message = e.message;
      } else if (typeof e === "string") {
        message = e;
      } else {
        message = "";
      }
      super(message);
      this.name = this.constructor.name;
    }
  };
  var InvalidParamError = class extends HpkeError {
  };
  var SerializeError = class extends HpkeError {
  };
  var DeserializeError = class extends HpkeError {
  };
  var EncapError = class extends HpkeError {
  };
  var DecapError = class extends HpkeError {
  };
  var ExportError = class extends HpkeError {
  };
  var SealError = class extends HpkeError {
  };
  var OpenError = class extends HpkeError {
  };
  var MessageLimitReachedError = class extends HpkeError {
  };
  var DeriveKeyPairError = class extends HpkeError {
  };
  var NotSupportedError = class extends HpkeError {
  };

  // node_modules/@hpke/common/esm/_dnt.shims.js
  var dntGlobals = {};
  var dntGlobalThis = createMergeProxy(globalThis, dntGlobals);
  function createMergeProxy(baseObj, extObj) {
    return new Proxy(baseObj, {
      get(_target, prop, _receiver) {
        if (prop in extObj) {
          return extObj[prop];
        } else {
          return baseObj[prop];
        }
      },
      set(_target, prop, value) {
        if (prop in extObj) {
          delete extObj[prop];
        }
        baseObj[prop] = value;
        return true;
      },
      deleteProperty(_target, prop) {
        let success = false;
        if (prop in extObj) {
          delete extObj[prop];
          success = true;
        }
        if (prop in baseObj) {
          delete baseObj[prop];
          success = true;
        }
        return success;
      },
      ownKeys(_target) {
        const baseKeys = Reflect.ownKeys(baseObj);
        const extKeys = Reflect.ownKeys(extObj);
        const extKeysSet = new Set(extKeys);
        return [...baseKeys.filter((k) => !extKeysSet.has(k)), ...extKeys];
      },
      defineProperty(_target, prop, desc) {
        if (prop in extObj) {
          delete extObj[prop];
        }
        Reflect.defineProperty(baseObj, prop, desc);
        return true;
      },
      getOwnPropertyDescriptor(_target, prop) {
        if (prop in extObj) {
          return Reflect.getOwnPropertyDescriptor(extObj, prop);
        } else {
          return Reflect.getOwnPropertyDescriptor(baseObj, prop);
        }
      },
      has(_target, prop) {
        return prop in extObj || prop in baseObj;
      }
    });
  }

  // node_modules/@hpke/common/esm/src/algorithm.js
  async function loadSubtleCrypto() {
    if (dntGlobalThis !== void 0 && globalThis.crypto !== void 0) {
      return globalThis.crypto.subtle;
    }
    try {
      const { webcrypto } = await import("crypto");
      return webcrypto.subtle;
    } catch (e) {
      throw new NotSupportedError(e);
    }
  }
  var NativeAlgorithm = class {
    constructor() {
      Object.defineProperty(this, "_api", {
        enumerable: true,
        configurable: true,
        writable: true,
        value: void 0
      });
    }
    async _setup() {
      if (this._api !== void 0) {
        return;
      }
      this._api = await loadSubtleCrypto();
    }
  };

  // node_modules/@hpke/common/esm/src/identifiers.js
  var Mode = {
    Base: 0,
    Psk: 1,
    Auth: 2,
    AuthPsk: 3
  };
  var KemId = {
    NotAssigned: 0,
    DhkemP256HkdfSha256: 16,
    DhkemP384HkdfSha384: 17,
    DhkemP521HkdfSha512: 18,
    DhkemSecp256k1HkdfSha256: 19,
    DhkemX25519HkdfSha256: 32,
    DhkemX448HkdfSha512: 33,
    HybridkemX25519Kyber768: 48,
    MlKem512: 64,
    MlKem768: 65,
    MlKem1024: 66,
    XWing: 25722
  };
  var KdfId = {
    HkdfSha256: 1,
    HkdfSha384: 2,
    HkdfSha512: 3,
    Sha3256: 4,
    Sha3384: 5,
    Sha3512: 6,
    Shake128: 16,
    Shake256: 17,
    TurboShake128: 18,
    TurboShake256: 19
  };
  var AeadId = {
    Aes128Gcm: 1,
    Aes256Gcm: 2,
    Chacha20Poly1305: 3,
    ExportOnly: 65535
  };

  // node_modules/@hpke/common/esm/src/consts.js
  var INPUT_LENGTH_LIMIT = 8192;
  var INFO_LENGTH_LIMIT = 268435456;
  var MINIMUM_PSK_LENGTH = 32;
  var EMPTY = /* @__PURE__ */ new Uint8Array(0);

  // node_modules/@hpke/common/esm/src/interfaces/kemInterface.js
  var SUITE_ID_HEADER_KEM = /* @__PURE__ */ new Uint8Array([
    75,
    69,
    77,
    0,
    0
  ]);

  // node_modules/@hpke/common/esm/src/kdfs/hkdf.js
  var HPKE_VERSION = /* @__PURE__ */ new Uint8Array([
    72,
    80,
    75,
    69,
    45,
    118,
    49
  ]);
  function toUint8Array(input) {
    return new Uint8Array(toArrayBuffer(input));
  }
  function toArrayBuffer(input) {
    if (input instanceof ArrayBuffer) {
      return input;
    }
    if (ArrayBuffer.isView(input)) {
      return new Uint8Array(input.buffer, input.byteOffset, input.byteLength).slice().buffer;
    }
    return new Uint8Array(input).slice().buffer;
  }
  var HkdfNative = class extends NativeAlgorithm {
    constructor() {
      super();
      Object.defineProperty(this, "id", {
        enumerable: true,
        configurable: true,
        writable: true,
        value: KdfId.HkdfSha256
      });
      Object.defineProperty(this, "hashSize", {
        enumerable: true,
        configurable: true,
        writable: true,
        value: 0
      });
      Object.defineProperty(this, "_suiteId", {
        enumerable: true,
        configurable: true,
        writable: true,
        value: EMPTY
      });
      Object.defineProperty(this, "algHash", {
        enumerable: true,
        configurable: true,
        writable: true,
        value: {
          name: "HMAC",
          hash: "SHA-256",
          length: 256
        }
      });
    }
    init(suiteId) {
      this._suiteId = suiteId;
    }
    buildLabeledIkm(label, ikm) {
      this._checkInit();
      const ret = new Uint8Array(7 + this._suiteId.byteLength + label.byteLength + ikm.byteLength);
      ret.set(HPKE_VERSION, 0);
      ret.set(this._suiteId, 7);
      ret.set(label, 7 + this._suiteId.byteLength);
      ret.set(ikm, 7 + this._suiteId.byteLength + label.byteLength);
      return ret;
    }
    buildLabeledInfo(label, info, len) {
      this._checkInit();
      const ret = new Uint8Array(9 + this._suiteId.byteLength + label.byteLength + info.byteLength);
      ret.set(new Uint8Array([0, len]), 0);
      ret.set(HPKE_VERSION, 2);
      ret.set(this._suiteId, 9);
      ret.set(label, 9 + this._suiteId.byteLength);
      ret.set(info, 9 + this._suiteId.byteLength + label.byteLength);
      return ret;
    }
    async extract(salt, ikm) {
      await this._setup();
      const saltBuf = salt.byteLength === 0 ? new ArrayBuffer(this.hashSize) : toArrayBuffer(salt);
      if (saltBuf.byteLength !== this.hashSize) {
        throw new InvalidParamError("The salt length must be the same as the hashSize");
      }
      const ikmBuf = toArrayBuffer(ikm);
      const key = await this._api.importKey("raw", saltBuf, this.algHash, false, [
        "sign"
      ]);
      return await this._api.sign("HMAC", key, ikmBuf);
    }
    async expand(prk, info, len) {
      await this._setup();
      const prkBuf = toArrayBuffer(prk);
      const key = await this._api.importKey("raw", prkBuf, this.algHash, false, [
        "sign"
      ]);
      const okm = new ArrayBuffer(len);
      const okmBytes = new Uint8Array(okm);
      let prev = EMPTY;
      const mid = toUint8Array(info);
      const tail = new Uint8Array(1);
      if (len > 255 * this.hashSize) {
        throw new Error("Entropy limit reached");
      }
      const tmp = new Uint8Array(this.hashSize + mid.length + 1);
      for (let i = 1, cur = 0; cur < okmBytes.length; i++) {
        tail[0] = i;
        tmp.set(prev, 0);
        tmp.set(mid, prev.length);
        tmp.set(tail, prev.length + mid.length);
        prev = new Uint8Array(await this._api.sign("HMAC", key, tmp.slice(0, prev.length + mid.length + 1)));
        if (okmBytes.length - cur >= prev.length) {
          okmBytes.set(prev, cur);
          cur += prev.length;
        } else {
          okmBytes.set(prev.slice(0, okmBytes.length - cur), cur);
          cur += okmBytes.length - cur;
        }
      }
      return okm;
    }
    async extractAndExpand(salt, ikm, info, len) {
      await this._setup();
      const ikmBuf = toArrayBuffer(ikm);
      const baseKey = await this._api.importKey("raw", ikmBuf, "HKDF", false, ["deriveBits"]);
      return await this._api.deriveBits({
        name: "HKDF",
        hash: this.algHash.hash,
        salt: toArrayBuffer(salt),
        info: toArrayBuffer(info)
      }, baseKey, len * 8);
    }
    async labeledExtract(salt, label, ikm) {
      return await this.extract(salt, this.buildLabeledIkm(label, ikm));
    }
    async labeledExpand(prk, label, info, len) {
      return await this.expand(prk, this.buildLabeledInfo(label, info, len), len);
    }
    _checkInit() {
      if (this._suiteId === EMPTY) {
        throw new Error("Not initialized. Call init()");
      }
    }
  };
  var HkdfSha256Native = class extends HkdfNative {
    constructor() {
      super(...arguments);
      Object.defineProperty(this, "id", {
        enumerable: true,
        configurable: true,
        writable: true,
        value: KdfId.HkdfSha256
      });
      Object.defineProperty(this, "hashSize", {
        enumerable: true,
        configurable: true,
        writable: true,
        value: 32
      });
      Object.defineProperty(this, "algHash", {
        enumerable: true,
        configurable: true,
        writable: true,
        value: {
          name: "HMAC",
          hash: "SHA-256",
          length: 256
        }
      });
    }
  };

  // node_modules/@hpke/common/esm/src/utils/misc.js
  var isCryptoKeyPair = (x) => typeof x === "object" && x !== null && typeof x.privateKey === "object" && typeof x.publicKey === "object";
  function i2Osp(n, w) {
    if (w <= 0) {
      throw new Error("i2Osp: too small size");
    }
    if (n >= 256 ** w) {
      throw new Error("i2Osp: too large integer");
    }
    const ret = new Uint8Array(w);
    for (let i = 0; i < w && n; i++) {
      ret[w - (i + 1)] = n % 256;
      n = Math.floor(n / 256);
    }
    return ret;
  }
  function concat(a, b) {
    const ret = new Uint8Array(a.length + b.length);
    ret.set(a, 0);
    ret.set(b, a.length);
    return ret;
  }
  function base64UrlToBytes(v) {
    const base64 = v.replace(/-/g, "+").replace(/_/g, "/");
    const byteString = atob(base64);
    const ret = new Uint8Array(byteString.length);
    for (let i = 0; i < byteString.length; i++) {
      ret[i] = byteString.charCodeAt(i);
    }
    return ret;
  }
  function xor(a, b) {
    if (a.byteLength !== b.byteLength) {
      throw new Error("xor: different length inputs");
    }
    const buf = new Uint8Array(a.byteLength);
    for (let i = 0; i < a.byteLength; i++) {
      buf[i] = a[i] ^ b[i];
    }
    return buf;
  }

  // node_modules/@hpke/common/esm/src/kems/dhkem.js
  var LABEL_EAE_PRK = /* @__PURE__ */ new Uint8Array([
    101,
    97,
    101,
    95,
    112,
    114,
    107
  ]);
  var LABEL_SHARED_SECRET = /* @__PURE__ */ new Uint8Array([
    115,
    104,
    97,
    114,
    101,
    100,
    95,
    115,
    101,
    99,
    114,
    101,
    116
  ]);
  function concat3(a, b, c) {
    const ret = new Uint8Array(a.length + b.length + c.length);
    ret.set(a, 0);
    ret.set(b, a.length);
    ret.set(c, a.length + b.length);
    return ret;
  }
  var Dhkem = class {
    constructor(id, prim, kdf) {
      Object.defineProperty(this, "id", {
        enumerable: true,
        configurable: true,
        writable: true,
        value: void 0
      });
      Object.defineProperty(this, "secretSize", {
        enumerable: true,
        configurable: true,
        writable: true,
        value: 0
      });
      Object.defineProperty(this, "encSize", {
        enumerable: true,
        configurable: true,
        writable: true,
        value: 0
      });
      Object.defineProperty(this, "publicKeySize", {
        enumerable: true,
        configurable: true,
        writable: true,
        value: 0
      });
      Object.defineProperty(this, "privateKeySize", {
        enumerable: true,
        configurable: true,
        writable: true,
        value: 0
      });
      Object.defineProperty(this, "_prim", {
        enumerable: true,
        configurable: true,
        writable: true,
        value: void 0
      });
      Object.defineProperty(this, "_kdf", {
        enumerable: true,
        configurable: true,
        writable: true,
        value: void 0
      });
      this.id = id;
      this._prim = prim;
      this._kdf = kdf;
      const suiteId = new Uint8Array(SUITE_ID_HEADER_KEM);
      suiteId.set(i2Osp(this.id, 2), 3);
      this._kdf.init(suiteId);
    }
    async serializePublicKey(key) {
      return await this._prim.serializePublicKey(key);
    }
    async deserializePublicKey(key) {
      return await this._prim.deserializePublicKey(toArrayBuffer(key));
    }
    async serializePrivateKey(key) {
      return await this._prim.serializePrivateKey(key);
    }
    async deserializePrivateKey(key) {
      return await this._prim.deserializePrivateKey(toArrayBuffer(key));
    }
    async importKey(format, key, isPublic = true) {
      return await this._prim.importKey(format, key, isPublic);
    }
    async generateKeyPair() {
      return await this._prim.generateKeyPair();
    }
    async deriveKeyPair(ikm) {
      const rawIkm = toArrayBuffer(ikm);
      if (rawIkm.byteLength > INPUT_LENGTH_LIMIT) {
        throw new InvalidParamError("Too long ikm");
      }
      return await this._prim.deriveKeyPair(rawIkm);
    }
    async encap(params) {
      let ke;
      if (params.ekm === void 0) {
        ke = await this.generateKeyPair();
      } else if (isCryptoKeyPair(params.ekm)) {
        ke = params.ekm;
      } else {
        ke = await this.deriveKeyPair(params.ekm);
      }
      const enc = await this._prim.serializePublicKey(ke.publicKey);
      const pkrm = await this._prim.serializePublicKey(params.recipientPublicKey);
      try {
        let dh;
        if (params.senderKey === void 0) {
          dh = new Uint8Array(await this._prim.dh(ke.privateKey, params.recipientPublicKey));
        } else {
          const sks = isCryptoKeyPair(params.senderKey) ? params.senderKey.privateKey : params.senderKey;
          const dh1 = new Uint8Array(await this._prim.dh(ke.privateKey, params.recipientPublicKey));
          const dh2 = new Uint8Array(await this._prim.dh(sks, params.recipientPublicKey));
          dh = concat(dh1, dh2);
        }
        let kemContext;
        if (params.senderKey === void 0) {
          kemContext = concat(new Uint8Array(enc), new Uint8Array(pkrm));
        } else {
          const pks = isCryptoKeyPair(params.senderKey) ? params.senderKey.publicKey : await this._prim.derivePublicKey(params.senderKey);
          const pksm = await this._prim.serializePublicKey(pks);
          kemContext = concat3(new Uint8Array(enc), new Uint8Array(pkrm), new Uint8Array(pksm));
        }
        const sharedSecret = await this._generateSharedSecret(dh, kemContext);
        return {
          enc,
          sharedSecret
        };
      } catch (e) {
        throw new EncapError(e);
      }
    }
    async decap(params) {
      const enc = toArrayBuffer(params.enc);
      const pke = await this._prim.deserializePublicKey(enc);
      const skr = isCryptoKeyPair(params.recipientKey) ? params.recipientKey.privateKey : params.recipientKey;
      const pkr = isCryptoKeyPair(params.recipientKey) ? params.recipientKey.publicKey : await this._prim.derivePublicKey(params.recipientKey);
      const pkrm = await this._prim.serializePublicKey(pkr);
      try {
        let dh;
        if (params.senderPublicKey === void 0) {
          dh = new Uint8Array(await this._prim.dh(skr, pke));
        } else {
          const dh1 = new Uint8Array(await this._prim.dh(skr, pke));
          const dh2 = new Uint8Array(await this._prim.dh(skr, params.senderPublicKey));
          dh = concat(dh1, dh2);
        }
        let kemContext;
        if (params.senderPublicKey === void 0) {
          kemContext = concat(new Uint8Array(enc), new Uint8Array(pkrm));
        } else {
          const pksm = await this._prim.serializePublicKey(params.senderPublicKey);
          kemContext = new Uint8Array(enc.byteLength + pkrm.byteLength + pksm.byteLength);
          kemContext.set(new Uint8Array(enc), 0);
          kemContext.set(new Uint8Array(pkrm), enc.byteLength);
          kemContext.set(new Uint8Array(pksm), enc.byteLength + pkrm.byteLength);
        }
        return await this._generateSharedSecret(dh, kemContext);
      } catch (e) {
        throw new DecapError(e);
      }
    }
    async _generateSharedSecret(dh, kemContext) {
      const labeledIkm = this._kdf.buildLabeledIkm(LABEL_EAE_PRK, dh);
      const labeledInfo = this._kdf.buildLabeledInfo(LABEL_SHARED_SECRET, kemContext, this.secretSize);
      return await this._kdf.extractAndExpand(EMPTY, labeledIkm, labeledInfo, this.secretSize);
    }
  };

  // node_modules/@hpke/common/esm/src/interfaces/dhkemPrimitives.js
  var KEM_USAGES = ["deriveBits"];
  var LABEL_DKP_PRK = /* @__PURE__ */ new Uint8Array([
    100,
    107,
    112,
    95,
    112,
    114,
    107
  ]);
  var LABEL_SK = /* @__PURE__ */ new Uint8Array([115, 107]);

  // node_modules/@hpke/common/esm/src/kems/dhkemPrimitives/ec.js
  var EC_P_521_PARAMS = {
    p: (1n << 521n) - 1n,
    b: 0x0051953eb9618e1c9a1f929a21a0b68540eea2da725b99b315f3b8b489918ef109e156193951ec7e937b1652c0bd3bb1bf073573df883d2c34f1ef451fd46b503f00n,
    gx: 0x00c6858e06b70404e9cd9e3ecb662395b4429c648139053fb521f828af606b4d3dbaa14b5e77efe75928fe1dc127a2ffa8de3348b3c1856a429bf97e7e31c2e5bd66n,
    gy: 0x011839296a789a3bc0045c8a5fb42c7d1bd998f54449579b446817afbd17273e662c97ee72995ef42640c550b9013fad0761353c7086a272c24088be94769fd16650n,
    coordinateSize: 66
  };

  // node_modules/@hpke/common/esm/src/interfaces/aeadEncryptionContext.js
  var AEAD_USAGES = ["encrypt", "decrypt"];

  // node_modules/@hpke/common/esm/src/utils/noble.js
  function isBytes(a) {
    return a instanceof Uint8Array || ArrayBuffer.isView(a) && a.constructor.name === "Uint8Array";
  }
  function anumber(n, title = "") {
    if (!Number.isSafeInteger(n) || n < 0) {
      const prefix = title && `"${title}" `;
      throw new Error(`${prefix}expected integer >0, got ${n}`);
    }
  }
  function abytes(value, length, title = "") {
    const bytes = isBytes(value);
    const len = value?.length;
    const needsLen = length !== void 0;
    if (!bytes || needsLen && len !== length) {
      const prefix = title && `"${title}" `;
      const ofLen = needsLen ? ` of length ${length}` : "";
      const got = bytes ? `length=${len}` : `type=${typeof value}`;
      throw new Error(prefix + "expected Uint8Array" + ofLen + ", got " + got);
    }
    return value;
  }
  function aexists(instance, checkFinished = true) {
    if (instance.destroyed)
      throw new Error("Hash instance has been destroyed");
    if (checkFinished && instance.finished) {
      throw new Error("Hash#digest() has already been called");
    }
  }
  function clean(...arrays) {
    for (let i = 0; i < arrays.length; i++) {
      arrays[i].fill(0);
    }
  }
  var _endianTestBuffer = /* @__PURE__ */ new Uint32Array([287454020]);
  var _endianTestBytes = /* @__PURE__ */ new Uint8Array(_endianTestBuffer.buffer);
  var isLE = _endianTestBytes[0] === 68;

  // node_modules/@hpke/common/esm/src/hash/hash.js
  function ahash(h) {
    if (typeof h !== "function" || typeof h.create !== "function") {
      throw new Error("Hash must wrapped by utils.createHasher");
    }
    anumber(h.outputLen);
    anumber(h.blockLen);
  }

  // node_modules/@hpke/common/esm/src/hash/hmac.js
  var _HMAC = class {
    constructor(hash, key) {
      Object.defineProperty(this, "oHash", {
        enumerable: true,
        configurable: true,
        writable: true,
        value: void 0
      });
      Object.defineProperty(this, "iHash", {
        enumerable: true,
        configurable: true,
        writable: true,
        value: void 0
      });
      Object.defineProperty(this, "blockLen", {
        enumerable: true,
        configurable: true,
        writable: true,
        value: void 0
      });
      Object.defineProperty(this, "outputLen", {
        enumerable: true,
        configurable: true,
        writable: true,
        value: void 0
      });
      Object.defineProperty(this, "finished", {
        enumerable: true,
        configurable: true,
        writable: true,
        value: false
      });
      Object.defineProperty(this, "destroyed", {
        enumerable: true,
        configurable: true,
        writable: true,
        value: false
      });
      ahash(hash);
      abytes(key, void 0, "key");
      this.iHash = hash.create();
      if (typeof this.iHash.update !== "function") {
        throw new Error("Expected instance of class which extends utils.Hash");
      }
      this.blockLen = this.iHash.blockLen;
      this.outputLen = this.iHash.outputLen;
      const blockLen = this.blockLen;
      const pad = new Uint8Array(blockLen);
      pad.set(key.length > blockLen ? hash.create().update(key).digest() : key);
      for (let i = 0; i < pad.length; i++)
        pad[i] ^= 54;
      this.iHash.update(pad);
      this.oHash = hash.create();
      for (let i = 0; i < pad.length; i++)
        pad[i] ^= 54 ^ 92;
      this.oHash.update(pad);
      clean(pad);
    }
    update(buf) {
      aexists(this);
      this.iHash.update(buf);
      return this;
    }
    digestInto(out) {
      aexists(this);
      abytes(out, this.outputLen, "output");
      this.finished = true;
      this.iHash.digestInto(out);
      this.oHash.update(out);
      this.oHash.digestInto(out);
      this.destroy();
    }
    digest() {
      const out = new Uint8Array(this.oHash.outputLen);
      this.digestInto(out);
      return out;
    }
    _cloneInto(to) {
      to ||= Object.create(Object.getPrototypeOf(this), {});
      const { oHash, iHash, finished, destroyed, blockLen, outputLen } = this;
      to = to;
      to.finished = finished;
      to.destroyed = destroyed;
      to.blockLen = blockLen;
      to.outputLen = outputLen;
      to.oHash = oHash._cloneInto(to.oHash);
      to.iHash = iHash._cloneInto(to.iHash);
      return to;
    }
    clone() {
      return this._cloneInto();
    }
    destroy() {
      this.destroyed = true;
      this.oHash.destroy();
      this.iHash.destroy();
    }
  };
  var hmac = (hash, key, message) => new _HMAC(hash, key).update(message).digest();
  hmac.create = (hash, key) => new _HMAC(hash, key);

  // node_modules/@hpke/common/esm/src/hash/u64.js
  var U32_MASK64 = 0xffffffffn;
  var _32n = 32n;
  function fromBig(n, le = false) {
    if (le) {
      return { h: Number(n & U32_MASK64), l: Number(n >> _32n & U32_MASK64) };
    }
    return {
      h: Number(n >> _32n & U32_MASK64) | 0,
      l: Number(n & U32_MASK64) | 0
    };
  }
  function split(lst, le = false) {
    const len = lst.length;
    const Ah = new Uint32Array(len);
    const Al = new Uint32Array(len);
    for (let i = 0; i < len; i++) {
      const { h, l } = fromBig(lst[i], le);
      [Ah[i], Al[i]] = [h, l];
    }
    return [Ah, Al];
  }

  // node_modules/@hpke/common/esm/src/hash/sha3.js
  var _0n = 0n;
  var _1n = 1n;
  var _2n = 2n;
  var _7n = 7n;
  var _256n = 256n;
  var _0x71n = 0x71n;
  var SHA3_PI = [];
  var SHA3_ROTL = [];
  var _SHA3_IOTA = [];
  for (let round = 0, R = _1n, x = 1, y = 0; round < 24; round++) {
    [x, y] = [y, (2 * x + 3 * y) % 5];
    SHA3_PI.push(2 * (5 * y + x));
    SHA3_ROTL.push((round + 1) * (round + 2) / 2 % 64);
    let t = _0n;
    for (let j = 0; j < 7; j++) {
      R = (R << _1n ^ (R >> _7n) * _0x71n) % _256n;
      if (R & _2n)
        t ^= _1n << (_1n << BigInt(j)) - _1n;
    }
    _SHA3_IOTA.push(t);
  }
  var IOTAS = split(_SHA3_IOTA, true);
  var SHA3_IOTA_H = IOTAS[0];
  var SHA3_IOTA_L = IOTAS[1];

  // node_modules/@hpke/core/esm/src/aeads/aesGcm.js
  var AesGcmContext = class extends NativeAlgorithm {
    constructor(key) {
      super();
      Object.defineProperty(this, "_rawKey", {
        enumerable: true,
        configurable: true,
        writable: true,
        value: void 0
      });
      Object.defineProperty(this, "_key", {
        enumerable: true,
        configurable: true,
        writable: true,
        value: void 0
      });
      this._rawKey = toArrayBuffer(key);
    }
    async seal(iv, data, aad2) {
      await this._setupKey();
      const alg = {
        name: "AES-GCM",
        iv: toArrayBuffer(iv),
        additionalData: toArrayBuffer(aad2)
      };
      const ct = await this._api.encrypt(alg, this._key, toArrayBuffer(data));
      return ct;
    }
    async open(iv, data, aad2) {
      await this._setupKey();
      const alg = {
        name: "AES-GCM",
        iv: toArrayBuffer(iv),
        additionalData: toArrayBuffer(aad2)
      };
      const pt = await this._api.decrypt(alg, this._key, toArrayBuffer(data));
      return pt;
    }
    async _setupKey() {
      if (this._key !== void 0) {
        return;
      }
      await this._setup();
      const key = await this._importKey(this._rawKey);
      new Uint8Array(this._rawKey).fill(0);
      this._key = key;
      return;
    }
    async _importKey(key) {
      return await this._api.importKey("raw", key, { name: "AES-GCM" }, true, AEAD_USAGES);
    }
  };
  var Aes128Gcm = class {
    constructor() {
      Object.defineProperty(this, "id", {
        enumerable: true,
        configurable: true,
        writable: true,
        value: AeadId.Aes128Gcm
      });
      Object.defineProperty(this, "keySize", {
        enumerable: true,
        configurable: true,
        writable: true,
        value: 16
      });
      Object.defineProperty(this, "nonceSize", {
        enumerable: true,
        configurable: true,
        writable: true,
        value: 12
      });
      Object.defineProperty(this, "tagSize", {
        enumerable: true,
        configurable: true,
        writable: true,
        value: 16
      });
    }
    createEncryptionContext(key) {
      return new AesGcmContext(key);
    }
  };
  var Aes256Gcm = class extends Aes128Gcm {
    constructor() {
      super(...arguments);
      Object.defineProperty(this, "id", {
        enumerable: true,
        configurable: true,
        writable: true,
        value: AeadId.Aes256Gcm
      });
      Object.defineProperty(this, "keySize", {
        enumerable: true,
        configurable: true,
        writable: true,
        value: 32
      });
      Object.defineProperty(this, "nonceSize", {
        enumerable: true,
        configurable: true,
        writable: true,
        value: 12
      });
      Object.defineProperty(this, "tagSize", {
        enumerable: true,
        configurable: true,
        writable: true,
        value: 16
      });
    }
  };

  // node_modules/@hpke/core/esm/src/utils/emitNotSupported.js
  function emitNotSupported() {
    return new Promise((_resolve, reject) => {
      reject(new NotSupportedError("Not supported"));
    });
  }

  // node_modules/@hpke/core/esm/src/exporterContext.js
  var LABEL_SEC = new Uint8Array([115, 101, 99]);
  var ExporterContextImpl = class {
    constructor(api, kdf, exporterSecret) {
      Object.defineProperty(this, "_api", {
        enumerable: true,
        configurable: true,
        writable: true,
        value: void 0
      });
      Object.defineProperty(this, "exporterSecret", {
        enumerable: true,
        configurable: true,
        writable: true,
        value: void 0
      });
      Object.defineProperty(this, "_kdf", {
        enumerable: true,
        configurable: true,
        writable: true,
        value: void 0
      });
      this._api = api;
      this._kdf = kdf;
      this.exporterSecret = exporterSecret;
    }
    async seal(_data, _aad) {
      return await emitNotSupported();
    }
    async open(_data, _aad) {
      return await emitNotSupported();
    }
    async export(exporterContext, len) {
      const rawExporterContext = toArrayBuffer(exporterContext);
      if (rawExporterContext.byteLength > INPUT_LENGTH_LIMIT) {
        throw new InvalidParamError("Too long exporter context");
      }
      try {
        return await this._kdf.labeledExpand(this.exporterSecret, LABEL_SEC, new Uint8Array(rawExporterContext), len);
      } catch (e) {
        throw new ExportError(e);
      }
    }
  };
  var RecipientExporterContextImpl = class extends ExporterContextImpl {
  };
  var SenderExporterContextImpl = class extends ExporterContextImpl {
    constructor(api, kdf, exporterSecret, enc) {
      super(api, kdf, exporterSecret);
      Object.defineProperty(this, "enc", {
        enumerable: true,
        configurable: true,
        writable: true,
        value: void 0
      });
      this.enc = enc;
      return;
    }
  };

  // node_modules/@hpke/core/esm/src/encryptionContext.js
  var EncryptionContextImpl = class extends ExporterContextImpl {
    constructor(api, kdf, params) {
      super(api, kdf, params.exporterSecret);
      Object.defineProperty(this, "_aead", {
        enumerable: true,
        configurable: true,
        writable: true,
        value: void 0
      });
      Object.defineProperty(this, "_nK", {
        enumerable: true,
        configurable: true,
        writable: true,
        value: void 0
      });
      Object.defineProperty(this, "_nN", {
        enumerable: true,
        configurable: true,
        writable: true,
        value: void 0
      });
      Object.defineProperty(this, "_nT", {
        enumerable: true,
        configurable: true,
        writable: true,
        value: void 0
      });
      Object.defineProperty(this, "_ctx", {
        enumerable: true,
        configurable: true,
        writable: true,
        value: void 0
      });
      if (params.key === void 0 || params.baseNonce === void 0 || params.seq === void 0) {
        throw new Error("Required parameters are missing");
      }
      this._aead = params.aead;
      this._nK = this._aead.keySize;
      this._nN = this._aead.nonceSize;
      this._nT = this._aead.tagSize;
      const key = this._aead.createEncryptionContext(params.key);
      this._ctx = {
        key,
        baseNonce: params.baseNonce,
        seq: params.seq
      };
    }
    computeNonce(k) {
      const seqBytes = i2Osp(k.seq, k.baseNonce.byteLength);
      return xor(k.baseNonce, seqBytes).buffer;
    }
    incrementSeq(k) {
      if (k.seq > Number.MAX_SAFE_INTEGER) {
        throw new MessageLimitReachedError("Message limit reached");
      }
      k.seq += 1;
      return;
    }
  };

  // node_modules/@hpke/core/esm/src/mutex.js
  var __classPrivateFieldGet = function(receiver, state, kind, f) {
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a getter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
    return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
  };
  var __classPrivateFieldSet = function(receiver, state, value, kind, f) {
    if (kind === "m") throw new TypeError("Private method is not writable");
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a setter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot write private member to an object whose class did not declare it");
    return kind === "a" ? f.call(receiver, value) : f ? f.value = value : state.set(receiver, value), value;
  };
  var _Mutex_locked;
  var Mutex = class {
    constructor() {
      _Mutex_locked.set(this, Promise.resolve());
    }
    async lock() {
      let releaseLock;
      const nextLock = new Promise((resolve) => {
        releaseLock = resolve;
      });
      const previousLock = __classPrivateFieldGet(this, _Mutex_locked, "f");
      __classPrivateFieldSet(this, _Mutex_locked, nextLock, "f");
      await previousLock;
      return releaseLock;
    }
  };
  _Mutex_locked = /* @__PURE__ */ new WeakMap();

  // node_modules/@hpke/core/esm/src/recipientContext.js
  var __classPrivateFieldGet2 = function(receiver, state, kind, f) {
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a getter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
    return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
  };
  var __classPrivateFieldSet2 = function(receiver, state, value, kind, f) {
    if (kind === "m") throw new TypeError("Private method is not writable");
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a setter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot write private member to an object whose class did not declare it");
    return kind === "a" ? f.call(receiver, value) : f ? f.value = value : state.set(receiver, value), value;
  };
  var _RecipientContextImpl_mutex;
  var RecipientContextImpl = class extends EncryptionContextImpl {
    constructor() {
      super(...arguments);
      _RecipientContextImpl_mutex.set(this, void 0);
    }
    async open(data, aad2 = EMPTY.buffer) {
      __classPrivateFieldSet2(this, _RecipientContextImpl_mutex, __classPrivateFieldGet2(this, _RecipientContextImpl_mutex, "f") ?? new Mutex(), "f");
      const release = await __classPrivateFieldGet2(this, _RecipientContextImpl_mutex, "f").lock();
      let pt;
      try {
        pt = await this._ctx.key.open(this.computeNonce(this._ctx), toArrayBuffer(data), toArrayBuffer(aad2));
      } catch (e) {
        throw new OpenError(e);
      } finally {
        release();
      }
      this.incrementSeq(this._ctx);
      return pt;
    }
  };
  _RecipientContextImpl_mutex = /* @__PURE__ */ new WeakMap();

  // node_modules/@hpke/core/esm/src/senderContext.js
  var __classPrivateFieldGet3 = function(receiver, state, kind, f) {
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a getter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
    return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
  };
  var __classPrivateFieldSet3 = function(receiver, state, value, kind, f) {
    if (kind === "m") throw new TypeError("Private method is not writable");
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a setter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot write private member to an object whose class did not declare it");
    return kind === "a" ? f.call(receiver, value) : f ? f.value = value : state.set(receiver, value), value;
  };
  var _SenderContextImpl_mutex;
  var SenderContextImpl = class extends EncryptionContextImpl {
    constructor(api, kdf, params, enc) {
      super(api, kdf, params);
      Object.defineProperty(this, "enc", {
        enumerable: true,
        configurable: true,
        writable: true,
        value: void 0
      });
      _SenderContextImpl_mutex.set(this, void 0);
      this.enc = enc;
    }
    async seal(data, aad2 = EMPTY.buffer) {
      __classPrivateFieldSet3(this, _SenderContextImpl_mutex, __classPrivateFieldGet3(this, _SenderContextImpl_mutex, "f") ?? new Mutex(), "f");
      const release = await __classPrivateFieldGet3(this, _SenderContextImpl_mutex, "f").lock();
      let ct;
      try {
        ct = await this._ctx.key.seal(this.computeNonce(this._ctx), toArrayBuffer(data), toArrayBuffer(aad2));
      } catch (e) {
        throw new SealError(e);
      } finally {
        release();
      }
      this.incrementSeq(this._ctx);
      return ct;
    }
  };
  _SenderContextImpl_mutex = /* @__PURE__ */ new WeakMap();

  // node_modules/@hpke/core/esm/src/cipherSuiteNative.js
  var LABEL_BASE_NONCE = new Uint8Array([
    98,
    97,
    115,
    101,
    95,
    110,
    111,
    110,
    99,
    101
  ]);
  var LABEL_EXP = new Uint8Array([101, 120, 112]);
  var LABEL_INFO_HASH = new Uint8Array([
    105,
    110,
    102,
    111,
    95,
    104,
    97,
    115,
    104
  ]);
  var LABEL_KEY = new Uint8Array([107, 101, 121]);
  var LABEL_PSK_ID_HASH = new Uint8Array([
    112,
    115,
    107,
    95,
    105,
    100,
    95,
    104,
    97,
    115,
    104
  ]);
  var LABEL_SECRET = new Uint8Array([115, 101, 99, 114, 101, 116]);
  var SUITE_ID_HEADER_HPKE = new Uint8Array([
    72,
    80,
    75,
    69,
    0,
    0,
    0,
    0,
    0,
    0
  ]);
  var CipherSuiteNative = class extends NativeAlgorithm {
    /**
     * @param params A set of parameters for building a cipher suite.
     *
     * If the error occurred, throws {@link InvalidParamError}.
     *
     * @throws {@link InvalidParamError}
     */
    constructor(params) {
      super();
      Object.defineProperty(this, "_kem", {
        enumerable: true,
        configurable: true,
        writable: true,
        value: void 0
      });
      Object.defineProperty(this, "_kdf", {
        enumerable: true,
        configurable: true,
        writable: true,
        value: void 0
      });
      Object.defineProperty(this, "_aead", {
        enumerable: true,
        configurable: true,
        writable: true,
        value: void 0
      });
      Object.defineProperty(this, "_suiteId", {
        enumerable: true,
        configurable: true,
        writable: true,
        value: void 0
      });
      if (typeof params.kem === "number") {
        throw new InvalidParamError("KemId cannot be used");
      }
      this._kem = params.kem;
      if (typeof params.kdf === "number") {
        throw new InvalidParamError("KdfId cannot be used");
      }
      this._kdf = params.kdf;
      if (typeof params.aead === "number") {
        throw new InvalidParamError("AeadId cannot be used");
      }
      this._aead = params.aead;
      this._suiteId = new Uint8Array(SUITE_ID_HEADER_HPKE);
      this._suiteId.set(i2Osp(this._kem.id, 2), 4);
      this._suiteId.set(i2Osp(this._kdf.id, 2), 6);
      this._suiteId.set(i2Osp(this._aead.id, 2), 8);
      this._kdf.init(this._suiteId);
    }
    /**
     * Gets the KEM context of the ciphersuite.
     */
    get kem() {
      return this._kem;
    }
    /**
     * Gets the KDF context of the ciphersuite.
     */
    get kdf() {
      return this._kdf;
    }
    /**
     * Gets the AEAD context of the ciphersuite.
     */
    get aead() {
      return this._aead;
    }
    /**
     * Creates an encryption context for a sender.
     *
     * If the error occurred, throws {@link DecapError} | {@link ValidationError}.
     *
     * @param params A set of parameters for the sender encryption context.
     * @returns A sender encryption context.
     * @throws {@link EncapError}, {@link ValidationError}
     */
    async createSenderContext(params) {
      this._validateInputLength(params);
      await this._setup();
      const dh = await this._kem.encap(params);
      let mode;
      if (params.psk !== void 0) {
        mode = params.senderKey !== void 0 ? Mode.AuthPsk : Mode.Psk;
      } else {
        mode = params.senderKey !== void 0 ? Mode.Auth : Mode.Base;
      }
      return await this._keyScheduleS(mode, dh.sharedSecret, dh.enc, params);
    }
    /**
     * Creates an encryption context for a recipient.
     *
     * If the error occurred, throws {@link DecapError}
     * | {@link DeserializeError} | {@link ValidationError}.
     *
     * @param params A set of parameters for the recipient encryption context.
     * @returns A recipient encryption context.
     * @throws {@link DecapError}, {@link DeserializeError}, {@link ValidationError}
     */
    async createRecipientContext(params) {
      this._validateInputLength(params);
      await this._setup();
      const sharedSecret = await this._kem.decap(params);
      let mode;
      if (params.psk !== void 0) {
        mode = params.senderPublicKey !== void 0 ? Mode.AuthPsk : Mode.Psk;
      } else {
        mode = params.senderPublicKey !== void 0 ? Mode.Auth : Mode.Base;
      }
      return await this._keyScheduleR(mode, sharedSecret, params);
    }
    /**
     * Encrypts a message to a recipient.
     *
     * If the error occurred, throws `EncapError` | `MessageLimitReachedError` | `SealError` | `ValidationError`.
     *
     * @param params A set of parameters for building a sender encryption context.
     * @param pt A plain text as bytes to be encrypted.
     * @param aad Additional authenticated data as bytes fed by an application.
     * @returns A cipher text and an encapsulated key as bytes.
     * @throws {@link EncapError}, {@link MessageLimitReachedError}, {@link SealError}, {@link ValidationError}
     */
    async seal(params, pt, aad2 = EMPTY.buffer) {
      const ctx = await this.createSenderContext(params);
      return {
        ct: await ctx.seal(pt, aad2),
        enc: ctx.enc
      };
    }
    /**
     * Decrypts a message from a sender.
     *
     * If the error occurred, throws `DecapError` | `DeserializeError` | `OpenError` | `ValidationError`.
     *
     * @param params A set of parameters for building a recipient encryption context.
     * @param ct An encrypted text as bytes to be decrypted.
     * @param aad Additional authenticated data as bytes fed by an application.
     * @returns A decrypted plain text as bytes.
     * @throws {@link DecapError}, {@link DeserializeError}, {@link OpenError}, {@link ValidationError}
     */
    async open(params, ct, aad2 = EMPTY.buffer) {
      const ctx = await this.createRecipientContext(params);
      return await ctx.open(ct, aad2);
    }
    // private verifyPskInputs(mode: Mode, params: KeyScheduleParams) {
    //   const gotPsk = (params.psk !== undefined);
    //   const gotPskId = (params.psk !== undefined && params.psk.id.byteLength > 0);
    //   if (gotPsk !== gotPskId) {
    //     throw new Error('Inconsistent PSK inputs');
    //   }
    //   if (gotPsk && (mode === Mode.Base || mode === Mode.Auth)) {
    //     throw new Error('PSK input provided when not needed');
    //   }
    //   if (!gotPsk && (mode === Mode.Psk || mode === Mode.AuthPsk)) {
    //     throw new Error('Missing required PSK input');
    //   }
    //   return;
    // }
    async _keySchedule(mode, sharedSecret, params) {
      const pskId = params.psk === void 0 ? EMPTY : toUint8Array(params.psk.id);
      const pskIdHash = await this._kdf.labeledExtract(EMPTY, LABEL_PSK_ID_HASH, pskId);
      const info = params.info === void 0 ? EMPTY : toUint8Array(params.info);
      const infoHash = await this._kdf.labeledExtract(EMPTY, LABEL_INFO_HASH, info);
      const keyScheduleContext = new Uint8Array(1 + pskIdHash.byteLength + infoHash.byteLength);
      keyScheduleContext.set(new Uint8Array([mode]), 0);
      keyScheduleContext.set(new Uint8Array(pskIdHash), 1);
      keyScheduleContext.set(new Uint8Array(infoHash), 1 + pskIdHash.byteLength);
      const psk = params.psk === void 0 ? EMPTY : toUint8Array(params.psk.key);
      const ikm = this._kdf.buildLabeledIkm(LABEL_SECRET, psk);
      const exporterSecretInfo = this._kdf.buildLabeledInfo(LABEL_EXP, keyScheduleContext, this._kdf.hashSize);
      const exporterSecret = await this._kdf.extractAndExpand(sharedSecret, ikm, exporterSecretInfo, this._kdf.hashSize);
      if (this._aead.id === AeadId.ExportOnly) {
        return { aead: this._aead, exporterSecret };
      }
      const keyInfo = this._kdf.buildLabeledInfo(LABEL_KEY, keyScheduleContext, this._aead.keySize);
      const key = await this._kdf.extractAndExpand(sharedSecret, ikm, keyInfo, this._aead.keySize);
      const baseNonceInfo = this._kdf.buildLabeledInfo(LABEL_BASE_NONCE, keyScheduleContext, this._aead.nonceSize);
      const baseNonce = await this._kdf.extractAndExpand(sharedSecret, ikm, baseNonceInfo, this._aead.nonceSize);
      return {
        aead: this._aead,
        exporterSecret,
        key,
        baseNonce: new Uint8Array(baseNonce),
        seq: 0
      };
    }
    async _keyScheduleS(mode, sharedSecret, enc, params) {
      const res = await this._keySchedule(mode, sharedSecret, params);
      if (res.key === void 0) {
        return new SenderExporterContextImpl(this._api, this._kdf, res.exporterSecret, enc);
      }
      return new SenderContextImpl(this._api, this._kdf, res, enc);
    }
    async _keyScheduleR(mode, sharedSecret, params) {
      const res = await this._keySchedule(mode, sharedSecret, params);
      if (res.key === void 0) {
        return new RecipientExporterContextImpl(this._api, this._kdf, res.exporterSecret);
      }
      return new RecipientContextImpl(this._api, this._kdf, res);
    }
    _validateInputLength(params) {
      if (params.info !== void 0 && params.info.byteLength > INFO_LENGTH_LIMIT) {
        throw new InvalidParamError("Too long info");
      }
      if (params.psk !== void 0) {
        if (params.psk.key.byteLength < MINIMUM_PSK_LENGTH) {
          throw new InvalidParamError(`PSK must have at least ${MINIMUM_PSK_LENGTH} bytes`);
        }
        if (params.psk.key.byteLength > INPUT_LENGTH_LIMIT) {
          throw new InvalidParamError("Too long psk.key");
        }
        if (params.psk.id.byteLength > INPUT_LENGTH_LIMIT) {
          throw new InvalidParamError("Too long psk.id");
        }
      }
      return;
    }
  };

  // node_modules/@hpke/core/esm/src/native.js
  var CipherSuite = class extends CipherSuiteNative {
  };
  var HkdfSha256 = class extends HkdfSha256Native {
  };

  // node_modules/@hpke/core/esm/src/kems/dhkemPrimitives/x25519.js
  var ALG_NAME = "X25519";
  var PKCS8_ALG_ID_X25519 = new Uint8Array([
    48,
    46,
    2,
    1,
    0,
    48,
    5,
    6,
    3,
    43,
    101,
    110,
    4,
    34,
    4,
    32
  ]);
  var BASE_POINT_X25519 = /* @__PURE__ */ (() => {
    const p = new Uint8Array(32);
    p[0] = 9;
    return p;
  })();
  var X25519 = class extends NativeAlgorithm {
    constructor(hkdf) {
      super();
      Object.defineProperty(this, "_hkdf", {
        enumerable: true,
        configurable: true,
        writable: true,
        value: void 0
      });
      Object.defineProperty(this, "_alg", {
        enumerable: true,
        configurable: true,
        writable: true,
        value: void 0
      });
      Object.defineProperty(this, "_nPk", {
        enumerable: true,
        configurable: true,
        writable: true,
        value: void 0
      });
      Object.defineProperty(this, "_nSk", {
        enumerable: true,
        configurable: true,
        writable: true,
        value: void 0
      });
      Object.defineProperty(this, "_nDh", {
        enumerable: true,
        configurable: true,
        writable: true,
        value: void 0
      });
      Object.defineProperty(this, "_pkcs8AlgId", {
        enumerable: true,
        configurable: true,
        writable: true,
        value: void 0
      });
      this._alg = { name: ALG_NAME };
      this._hkdf = hkdf;
      this._nPk = 32;
      this._nSk = 32;
      this._nDh = 32;
      this._pkcs8AlgId = PKCS8_ALG_ID_X25519;
    }
    async serializePublicKey(key) {
      await this._setup();
      try {
        return await this._api.exportKey("raw", key);
      } catch (e) {
        throw new SerializeError(e);
      }
    }
    async deserializePublicKey(key) {
      await this._setup();
      try {
        return await this._importRawKey(toArrayBuffer(key), true);
      } catch (e) {
        throw new DeserializeError(e);
      }
    }
    async serializePrivateKey(key) {
      await this._setup();
      try {
        const jwk = await this._api.exportKey("jwk", key);
        if (!("d" in jwk)) {
          throw new Error("Not private key");
        }
        return base64UrlToBytes(jwk["d"]).buffer;
      } catch (e) {
        throw new SerializeError(e);
      }
    }
    async deserializePrivateKey(key) {
      await this._setup();
      try {
        return await this._importRawKey(toArrayBuffer(key), false);
      } catch (e) {
        throw new DeserializeError(e);
      }
    }
    async importKey(format, key, isPublic) {
      await this._setup();
      try {
        if (format === "raw") {
          return await this._importRawKey(key, isPublic);
        }
        if (key instanceof ArrayBuffer) {
          throw new Error("Invalid jwk key format");
        }
        return await this._importJWK(key, isPublic);
      } catch (e) {
        throw new DeserializeError(e);
      }
    }
    async generateKeyPair() {
      await this._setup();
      try {
        return await this._api.generateKey(ALG_NAME, true, KEM_USAGES);
      } catch (e) {
        throw new NotSupportedError(e);
      }
    }
    async deriveKeyPair(ikm) {
      await this._setup();
      try {
        const rawIkm = toArrayBuffer(ikm);
        const dkpPrk = await this._hkdf.labeledExtract(EMPTY, LABEL_DKP_PRK, new Uint8Array(rawIkm));
        const rawSk = await this._hkdf.labeledExpand(dkpPrk, LABEL_SK, EMPTY, this._nSk);
        const rawSkBytes = new Uint8Array(rawSk);
        const sk = await this._deserializePkcs8Key(rawSkBytes);
        rawSkBytes.fill(0);
        return {
          privateKey: sk,
          publicKey: await this.derivePublicKey(sk)
        };
      } catch (e) {
        throw new DeriveKeyPairError(e);
      }
    }
    async derivePublicKey(key) {
      await this._setup();
      try {
        const jwk = await this._api.exportKey("jwk", key);
        delete jwk["d"];
        delete jwk["key_ops"];
        return await this._api.importKey("jwk", jwk, this._alg, true, []);
      } catch {
        try {
          const bp = await this._api.importKey("raw", BASE_POINT_X25519.buffer, this._alg, true, []);
          const bits = await this._api.deriveBits({
            name: ALG_NAME,
            public: bp
          }, key, this._nPk * 8);
          return await this._api.importKey("raw", bits, this._alg, true, []);
        } catch (e) {
          throw new DeserializeError(e);
        }
      }
    }
    async dh(sk, pk) {
      await this._setup();
      try {
        const bits = await this._api.deriveBits({
          name: ALG_NAME,
          public: pk
        }, sk, this._nDh * 8);
        return bits;
      } catch (e) {
        throw new SerializeError(e);
      }
    }
    async _importRawKey(key, isPublic) {
      if (isPublic && key.byteLength !== this._nPk) {
        throw new Error("Invalid public key for the ciphersuite");
      }
      if (!isPublic && key.byteLength !== this._nSk) {
        throw new Error("Invalid private key for the ciphersuite");
      }
      if (isPublic) {
        return await this._api.importKey("raw", key, this._alg, true, []);
      }
      return await this._deserializePkcs8Key(new Uint8Array(key));
    }
    async _importJWK(key, isPublic) {
      if (typeof key.kty === "undefined" || key.kty !== "OKP") {
        throw new Error(`Invalid kty: ${key.crv}`);
      }
      if (typeof key.crv === "undefined" || key.crv !== ALG_NAME) {
        throw new Error(`Invalid crv: ${key.crv}`);
      }
      if (isPublic) {
        if (typeof key.d !== "undefined") {
          throw new Error("Invalid key: `d` should not be set");
        }
        return await this._api.importKey("jwk", key, this._alg, true, []);
      }
      if (typeof key.d === "undefined") {
        throw new Error("Invalid key: `d` not found");
      }
      return await this._api.importKey("jwk", key, this._alg, true, KEM_USAGES);
    }
    async _deserializePkcs8Key(k) {
      const pkcs8Key = new Uint8Array(this._pkcs8AlgId.length + k.length);
      pkcs8Key.set(this._pkcs8AlgId, 0);
      pkcs8Key.set(k, this._pkcs8AlgId.length);
      return await this._api.importKey("pkcs8", pkcs8Key, this._alg, true, KEM_USAGES);
    }
  };

  // node_modules/@hpke/core/esm/src/kems/dhkemX25519.js
  var DhkemX25519HkdfSha256 = class extends Dhkem {
    constructor() {
      const kdf = new HkdfSha256Native();
      super(KemId.DhkemX25519HkdfSha256, new X25519(kdf), kdf);
      Object.defineProperty(this, "id", {
        enumerable: true,
        configurable: true,
        writable: true,
        value: KemId.DhkemX25519HkdfSha256
      });
      Object.defineProperty(this, "secretSize", {
        enumerable: true,
        configurable: true,
        writable: true,
        value: 32
      });
      Object.defineProperty(this, "encSize", {
        enumerable: true,
        configurable: true,
        writable: true,
        value: 32
      });
      Object.defineProperty(this, "publicKeySize", {
        enumerable: true,
        configurable: true,
        writable: true,
        value: 32
      });
      Object.defineProperty(this, "privateKeySize", {
        enumerable: true,
        configurable: true,
        writable: true,
        value: 32
      });
    }
  };

  // node_modules/@hpke/core/esm/src/kems/dhkemPrimitives/x448.js
  var PKCS8_ALG_ID_X448 = new Uint8Array([
    48,
    70,
    2,
    1,
    0,
    48,
    5,
    6,
    3,
    43,
    101,
    111,
    4,
    58,
    4,
    56
  ]);

  // node_modules/json-canonicalize/dist/index.mjs
  var CircularRootPathName = "$";
  function _serialize(obj, options) {
    let buffer = "";
    const vInclude = options && options.include;
    let vExclude = options && options.exclude;
    if (vExclude) {
      if (typeof vExclude === "string") vExclude = [vExclude];
    }
    if (vInclude) vInclude.sort();
    const visited = /* @__PURE__ */ new WeakMap();
    const allowCircular = options && options.allowCircular;
    const filterUndefined = options && options.filterUndefined;
    const undefinedInArrayToNull = options && options.undefinedInArrayToNull;
    const strictUndefined = options && options.strictUndefined;
    serialize(obj, CircularRootPathName);
    return buffer;
    function serialize(object, path) {
      if (strictUndefined && object === void 0) {
        throw new Error(
          `undefined is not permitted in JSON at "${path}" (strictUndefined)`
        );
      }
      if (object === null || typeof object !== "object" || object.toJSON != null) {
        if (typeof object === "number" && !Number.isFinite(object)) {
          throw new Error(
            `Non-finite number (${object}) is not permitted in JSON (RFC 8785 \xA73.2.2.3)`
          );
        }
        buffer += JSON.stringify(object);
      } else if (Array.isArray(object)) {
        const visitedPath = visited.get(object);
        if (visitedPath !== void 0) {
          if (path.startsWith(visitedPath)) {
            if (!allowCircular) {
              throw new Error("Circular reference detected");
            }
            buffer += '"[Circular:' + visitedPath + ']"';
            return;
          }
        }
        visited.set(object, path);
        buffer += "[";
        let next = false;
        object.forEach((element, index) => {
          if (next) {
            buffer += ",";
          }
          next = true;
          if (element === void 0 && strictUndefined) {
            throw new Error(
              `undefined is not permitted in JSON at "${path}[${index}]" (strictUndefined)`
            );
          }
          if (undefinedInArrayToNull && element === void 0) {
            element = null;
          }
          serialize(element, `${path}[${index}]`);
        });
        buffer += "]";
      } else {
        const visitedPath = visited.get(object);
        if (visitedPath !== void 0) {
          if (path.startsWith(visitedPath)) {
            if (!allowCircular) {
              throw new Error("Circular reference detected");
            }
            buffer += '"[Circular:' + visitedPath + ']"';
            return;
          }
        }
        visited.set(object, path);
        buffer += "{";
        let next = false;
        const addProp = (property) => {
          if (vExclude && vExclude.includes(property)) {
            return;
          }
          if (strictUndefined && object[property] === void 0) {
            throw new Error(
              `undefined is not permitted in JSON at "${path}.${property}" (strictUndefined)`
            );
          }
          if (next) {
            buffer += ",";
          }
          next = true;
          buffer += JSON.stringify(property);
          buffer += ":";
          serialize(object[property], `${path}.${property}`);
        };
        if (path === CircularRootPathName && vInclude) {
          vInclude.forEach((property) => {
            if (object.hasOwnProperty(property)) {
              addProp(property);
            }
          });
        } else {
          let vKeys = Object.keys(object);
          if (filterUndefined && !strictUndefined) {
            vKeys = vKeys.filter((k) => object[k] !== void 0);
          }
          vKeys.sort();
          vKeys.forEach((property) => {
            addProp(property);
          });
        }
        buffer += "}";
      }
    }
  }
  function canonicalize(obj, allowCircular) {
    return _serialize(obj, {
      allowCircular,
      filterUndefined: true,
      undefinedInArrayToNull: true
    });
  }

  // src/crypto/secure-v2.mjs
  var SUITE = "SC2-X25519-HKDFSHA256-AES256GCM-ED25519";
  var MAX_MEMBERS = 50;
  var te = new TextEncoder();
  var td = new TextDecoder("utf-8", { fatal: true });
  var hpke = new CipherSuite({
    kem: new DhkemX25519HkdfSha256(),
    kdf: new HkdfSha256(),
    aead: new Aes256Gcm()
  });
  var canonical = canonicalize;
  var encode = (v) => te.encode(canonical(v));
  var b64 = (v) => {
    let s = "";
    for (const c of new Uint8Array(v)) s += String.fromCharCode(c);
    return btoa(s);
  };
  function un64(s, length, max = 65536) {
    if (typeof s !== "string" || s.length > Math.ceil(max / 3) * 4 || !s.length || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(s))
      throw Error("Base64 kh\xF4ng h\u1EE3p l\u1EC7.");
    const out = Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
    if (length && out.length !== length || out.length > max || b64(out) !== s)
      throw Error("\u0110\u1ED9 d\xE0i Base64 kh\xF4ng h\u1EE3p l\u1EC7.");
    return out;
  }
  function uuid(v) {
    if (typeof v !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v))
      throw Error("UUID kh\xF4ng h\u1EE3p l\u1EC7.");
    return v;
  }
  function exact(value, keys) {
    if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).sort().join(",") !== [...keys].sort().join(","))
      throw Error("Envelope kh\xF4ng \u0111\xFAng c\u1EA5u tr\xFAc.");
  }
  async function digest(bytes) {
    return [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map((c) => c.toString(16).padStart(2, "0")).join("");
  }
  var eventHash = (event) => digest(encode(event));
  var public64 = async (key) => b64(await crypto.subtle.exportKey("spki", key));
  var importPublic = (value, algorithm) => crypto.subtle.importKey(
    "spki",
    un64(value, null, 128),
    algorithm,
    true,
    algorithm === "Ed25519" ? ["verify"] : []
  );
  async function sign(domain, document, key) {
    return b64(
      await crypto.subtle.sign(
        "Ed25519",
        key,
        te.encode(domain + "\0" + canonical(document))
      )
    );
  }
  async function verify(domain, document, signature, key) {
    try {
      return await crypto.subtle.verify(
        "Ed25519",
        await importPublic(key, "Ed25519"),
        un64(signature, 64),
        te.encode(domain + "\0" + canonical(document))
      );
    } catch {
      return false;
    }
  }
  function requireTrue(value, message) {
    if (!value) throw Error(message);
  }
  function memberSchema(m) {
    exact(m, ["id", "role", "encryptionKey", "signingKey"]);
    uuid(m.id);
    requireTrue(
      ["owner", "admin", "member"].includes(m.role),
      "Vai tr\xF2 kh\xF4ng h\u1EE3p l\u1EC7."
    );
    un64(m.encryptionKey, null, 128);
    un64(m.signingKey, null, 128);
  }
  function memberIdentity(id, encryptionKey, signingKey, role = "member") {
    return { id, role, encryptionKey, signingKey };
  }
  function rosterDocument({
    id,
    version = 1,
    prevHash = null,
    actorId,
    action = "create",
    name,
    description = "",
    avatarId = null,
    avatarHash = null,
    members,
    invitation = null
  }) {
    return {
      v: 2,
      id,
      version,
      prevHash,
      actorId,
      action,
      name,
      description,
      avatarId,
      avatarHash,
      members: [...members].sort((a, b) => a.id.localeCompare(b.id)),
      invitation
    };
  }
  async function signedEvent(document, key) {
    return {
      document,
      signature: await sign("seruchat/roster/v2", document, key)
    };
  }
  async function validateInvitation(invitation, history) {
    exact(invitation, ["document", "signature"]);
    const d = invitation.document;
    exact(d, [
      "v",
      "id",
      "groupId",
      "inviterId",
      "inviteeId",
      "issuedHash",
      "expiresAt"
    ]);
    [d.id, d.groupId, d.inviterId, d.inviteeId].forEach(uuid);
    requireTrue(
      d.v === 2 && Number.isSafeInteger(d.expiresAt),
      "L\u1EDDi m\u1EDDi kh\xF4ng h\u1EE3p l\u1EC7."
    );
    const issued = history.find((e) => e.hash === d.issuedHash);
    const inviter = issued?.event.document.members.find(
      (m) => m.id === d.inviterId
    );
    requireTrue(
      issued?.event.document.id === d.groupId && inviter && ["owner", "admin"].includes(inviter.role),
      "Ng\u01B0\u1EDDi m\u1EDDi kh\xF4ng c\xF3 quy\u1EC1n t\u1EA1i phi\xEAn b\u1EA3n \u0111\xE3 k\xFD."
    );
    requireTrue(
      await verify(
        "seruchat/invitation/v2",
        d,
        invitation.signature,
        inviter.signingKey
      ),
      "Ch\u1EEF k\xFD l\u1EDDi m\u1EDDi kh\xF4ng h\u1EE3p l\u1EC7."
    );
    return d;
  }
  async function validateEvent(event, history = [], usedInvites = /* @__PURE__ */ new Set()) {
    exact(event, ["document", "signature"]);
    const d = event.document;
    exact(d, [
      "v",
      "id",
      "version",
      "prevHash",
      "actorId",
      "action",
      "name",
      "description",
      "avatarId",
      "avatarHash",
      "members",
      "invitation"
    ]);
    uuid(d.id);
    uuid(d.actorId);
    requireTrue(
      d.v === 2 && Number.isSafeInteger(d.version) && d.version > 0 && d.version <= 1e3,
      "Phi\xEAn b\u1EA3n nh\xF3m kh\xF4ng h\u1EE3p l\u1EC7."
    );
    requireTrue(
      typeof d.name === "string" && d.name.trim().length > 0 && [...d.name].length <= 100 && typeof d.description === "string" && [...d.description].length <= 300,
      "T\xEAn/m\xF4 t\u1EA3 nh\xF3m kh\xF4ng h\u1EE3p l\u1EC7."
    );
    requireTrue(
      d.avatarId === null && d.avatarHash === null || uuid(d.avatarId) && /^[a-f0-9]{64}$/.test(d.avatarHash),
      "Avatar kh\xF4ng h\u1EE3p l\u1EC7."
    );
    requireTrue(
      Array.isArray(d.members) && d.members.length > 0 && d.members.length <= MAX_MEMBERS,
      "S\u1ED1 th\xE0nh vi\xEAn kh\xF4ng h\u1EE3p l\u1EC7."
    );
    d.members.forEach(memberSchema);
    const ids = d.members.map((m) => m.id);
    requireTrue(
      new Set(ids).size === ids.length && ids.join(",") === [...ids].sort().join(","),
      "Danh s\xE1ch th\xE0nh vi\xEAn ph\u1EA3i duy nh\u1EA5t v\xE0 s\u1EAFp x\u1EBFp."
    );
    requireTrue(
      d.members.filter((m) => m.role === "owner").length === 1,
      "Nh\xF3m c\u1EA7n \u0111\xFAng m\u1ED9t ch\u1EE7 s\u1EDF h\u1EEFu."
    );
    const previous = history.at(-1), p = previous?.event.document, oldActor = p?.members.find((m) => m.id === d.actorId), newActor = d.members.find((m) => m.id === d.actorId);
    if (!p) {
      requireTrue(
        d.version === 1 && d.prevHash === null && d.action === "create" && d.members.length === 1 && newActor?.role === "owner" && d.invitation === null,
        "Genesis nh\xF3m kh\xF4ng h\u1EE3p l\u1EC7."
      );
    } else {
      requireTrue(
        d.id === p.id && d.version === p.version + 1 && d.prevHash === previous.hash,
        "Chu\u1ED7i phi\xEAn b\u1EA3n nh\xF3m b\u1ECB thay \u0111\u1ED5i/rollback."
      );
      const before = new Map(p.members.map((m) => [m.id, m])), after = new Map(d.members.map((m) => [m.id, m]));
      for (const m of d.members) {
        const old = before.get(m.id);
        if (old)
          requireTrue(
            old.encryptionKey === m.encryptionKey && old.signingKey === m.signingKey,
            "Kh\xF3a th\xE0nh vi\xEAn b\u1ECB thay \u0111\u1ED5i."
          );
      }
      const added = d.members.filter((m) => !before.has(m.id)), removed = p.members.filter((m) => !after.has(m.id));
      const changed = d.members.filter(
        (m) => before.has(m.id) && before.get(m.id).role !== m.role
      );
      const metadata = canonical([p.name, p.description, p.avatarId, p.avatarHash]) !== canonical([d.name, d.description, d.avatarId, d.avatarHash]);
      if (d.action === "join") {
        requireTrue(
          !oldActor && added.length === 1 && added[0].id === d.actorId && added[0].role === "member" && !removed.length && !changed.length && !metadata,
          "Thay \u0111\u1ED5i join kh\xF4ng h\u1EE3p l\u1EC7."
        );
        const invitation = await validateInvitation(d.invitation, history), inviter = p.members.find((m) => m.id === invitation.inviterId);
        requireTrue(
          invitation.inviteeId === d.actorId && invitation.groupId === d.id && inviter && ["owner", "admin"].includes(inviter.role) && !usedInvites.has(invitation.id),
          "L\u1EDDi m\u1EDDi kh\xF4ng c\xF2n h\u1EE3p l\u1EC7."
        );
        usedInvites.add(invitation.id);
      } else {
        requireTrue(
          oldActor && d.invitation === null,
          "Ng\u01B0\u1EDDi thay \u0111\u1ED5i kh\xF4ng thu\u1ED9c nh\xF3m."
        );
        if (d.action === "update")
          requireTrue(
            ["owner", "admin"].includes(oldActor.role) && !added.length && !removed.length && !changed.length,
            "Kh\xF4ng c\xF3 quy\u1EC1n s\u1EEDa nh\xF3m."
          );
        else if (d.action === "leave")
          requireTrue(
            oldActor.role !== "owner" && removed.length === 1 && removed[0].id === d.actorId && !added.length && !changed.length && !metadata,
            "Kh\xF4ng th\u1EC3 r\u1EDDi nh\xF3m theo thay \u0111\u1ED5i n\xE0y."
          );
        else if (d.action === "remove")
          requireTrue(
            ["owner", "admin"].includes(oldActor.role) && removed.length === 1 && removed[0].id !== d.actorId && removed[0].role !== "owner" && (oldActor.role === "owner" || removed[0].role === "member") && !added.length && !changed.length && !metadata,
            "Kh\xF4ng c\xF3 quy\u1EC1n x\xF3a th\xE0nh vi\xEAn."
          );
        else if (d.action === "roles")
          requireTrue(
            oldActor.role === "owner" && !added.length && !removed.length && changed.length === 1 && changed[0].id !== d.actorId && changed[0].role !== "owner" && !metadata,
            "Kh\xF4ng c\xF3 quy\u1EC1n \u0111\u1ED5i vai tr\xF2."
          );
        else if (d.action === "transfer")
          requireTrue(
            oldActor.role === "owner" && !added.length && !removed.length && changed.length === 2 && newActor?.role === "admin" && changed.some((m) => m.role === "owner" && m.id !== d.actorId) && !metadata,
            "Chuy\u1EC3n ch\u1EE7 s\u1EDF h\u1EEFu kh\xF4ng h\u1EE3p l\u1EC7."
          );
        else throw Error("H\xE0nh \u0111\u1ED9ng nh\xF3m kh\xF4ng h\u1ED7 tr\u1EE3.");
      }
    }
    const actor = oldActor || newActor;
    requireTrue(
      actor && await verify(
        "seruchat/roster/v2",
        d,
        event.signature,
        actor.signingKey
      ),
      "Ch\u1EEF k\xFD danh s\xE1ch th\xE0nh vi\xEAn kh\xF4ng h\u1EE3p l\u1EC7."
    );
    return { event, hash: await eventHash(event) };
  }
  async function verifyChain(events, pinned = null) {
    requireTrue(
      Array.isArray(events) && events.length > 0 && events.length <= 1e3,
      "Chu\u1ED7i nh\xF3m tr\u1ED1ng/qu\xE1 gi\u1EDBi h\u1EA1n."
    );
    const history = [], used = /* @__PURE__ */ new Set();
    for (const event of events)
      history.push(await validateEvent(event, history, used));
    if (pinned)
      requireTrue(
        history.some(
          (e) => e.event.document.version === pinned.version && e.hash === pinned.hash
        ),
        "Server tr\u1EA3 nh\xF3m c\u0169 ho\u1EB7c chu\u1ED7i b\u1ECB fork."
      );
    return history;
  }
  async function identityProof(userId, encryptionPair) {
    const pair = await crypto.subtle.generateKey("Ed25519", true, [
      "sign",
      "verify"
    ]);
    const encryptionKey = await public64(encryptionPair.publicKey), signingKey = await public64(pair.publicKey), iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await identityVaultKey(encryptionPair.privateKey), aad2 = encode({ v: 2, userId, encryptionKey, signingKey });
    const raw = new Uint8Array(
      await crypto.subtle.exportKey("pkcs8", pair.privateKey)
    );
    try {
      const backup = {
        iv: b64(iv),
        ciphertext: b64(
          await crypto.subtle.encrypt(
            { name: "AES-GCM", iv, additionalData: aad2 },
            key,
            raw
          )
        )
      };
      const document = { v: 2, userId, encryptionKey, signingKey, backup };
      return {
        record: {
          ...document,
          signature: await sign(
            "seruchat/identity/v2",
            document,
            pair.privateKey
          )
        },
        pair
      };
    } finally {
      raw.fill(0);
    }
  }
  async function identityVaultKey(privateKey) {
    const raw = new Uint8Array(
      await crypto.subtle.exportKey("pkcs8", privateKey)
    );
    try {
      const input = await crypto.subtle.importKey("raw", raw, "HKDF", false, [
        "deriveKey"
      ]);
      return await crypto.subtle.deriveKey(
        {
          name: "HKDF",
          hash: "SHA-256",
          salt: new Uint8Array(32),
          info: te.encode("seruchat/v2/signing-vault-key")
        },
        input,
        { name: "AES-GCM", length: 256 },
        false,
        ["encrypt", "decrypt"]
      );
    } finally {
      raw.fill(0);
    }
  }
  async function validateIdentity(record) {
    exact(record, [
      "v",
      "userId",
      "encryptionKey",
      "signingKey",
      "backup",
      "signature"
    ]);
    uuid(record.userId);
    exact(record.backup, ["iv", "ciphertext"]);
    un64(record.backup.iv, 12);
    un64(record.backup.ciphertext, null, 4096);
    const { signature, ...doc } = record;
    requireTrue(
      doc.v === 2 && await verify("seruchat/identity/v2", doc, signature, doc.signingKey),
      "Identity proof kh\xF4ng h\u1EE3p l\u1EC7."
    );
    await importPublic(doc.encryptionKey, "X25519");
    return record;
  }
  async function restoreIdentity(record, encryptionPair) {
    await validateIdentity(record);
    requireTrue(
      await public64(encryptionPair.publicKey) === record.encryptionKey,
      "Identity kh\xF4ng kh\u1EDBp kh\xF3a chat c\u0169."
    );
    const key = await identityVaultKey(encryptionPair.privateKey), iv = un64(record.backup.iv, 12), aad2 = encode({
      v: 2,
      userId: record.userId,
      encryptionKey: record.encryptionKey,
      signingKey: record.signingKey
    });
    const raw = new Uint8Array(
      await crypto.subtle.decrypt(
        { name: "AES-GCM", iv, additionalData: aad2 },
        key,
        un64(record.backup.ciphertext)
      )
    );
    try {
      const privateKey = await crypto.subtle.importKey(
        "pkcs8",
        raw,
        "Ed25519",
        false,
        ["sign"]
      );
      const pair = {
        privateKey,
        publicKey: await importPublic(record.signingKey, "Ed25519")
      };
      requireTrue(
        await verify(
          "seruchat/key-check/v2",
          { id: record.userId },
          await sign("seruchat/key-check/v2", { id: record.userId }, privateKey),
          record.signingKey
        ),
        "Kh\xF3a k\xFD kh\xF4ng kh\u1EDBp."
      );
      return pair;
    } finally {
      raw.fill(0);
    }
  }
  async function directContext(id, members) {
    const sorted = [...members].sort((a, b) => a.id.localeCompare(b.id));
    return {
      scope: "direct",
      id,
      version: 1,
      members: sorted,
      hash: await digest(encode({ v: 2, scope: "direct", id, members: sorted }))
    };
  }
  function groupContext(history, version) {
    const item = version ? history.find((e) => e.event.document.version === version) : history.at(-1);
    requireTrue(item, "Kh\xF4ng c\xF3 phi\xEAn b\u1EA3n nh\xF3m n\xE0y.");
    const d = item.event.document;
    return {
      scope: "group",
      id: d.id,
      version: d.version,
      members: d.members,
      hash: item.hash
    };
  }
  function header(context, senderId, type = "text", id = crypto.randomUUID(), attachmentId = null) {
    return {
      id,
      v: 2,
      suite: SUITE,
      scope: context.scope,
      scopeId: context.id,
      senderId,
      type,
      membershipVersion: context.version,
      rosterHash: context.hash,
      attachmentId
    };
  }
  function validateHeader(h, context) {
    exact(h, [
      "id",
      "v",
      "suite",
      "scope",
      "scopeId",
      "senderId",
      "type",
      "membershipVersion",
      "rosterHash",
      "attachmentId"
    ]);
    [h.id, h.scopeId, h.senderId].forEach(uuid);
    requireTrue(
      h.v === 2 && h.suite === SUITE && ["text", "file"].includes(h.type) && h.scope === context.scope && h.scopeId === context.id && h.membershipVersion === context.version && h.rosterHash === context.hash && context.members.some((m) => m.id === h.senderId),
      "Header/phi\xEAn b\u1EA3n th\xE0nh vi\xEAn kh\xF4ng kh\u1EDBp."
    );
    if (h.type === "file") uuid(h.attachmentId);
    else requireTrue(h.attachmentId === null, "Text kh\xF4ng c\xF3 attachment.");
  }
  var aad = (domain, h) => encode({ domain, header: h });
  async function wrapCek(cek, h, members) {
    const wraps = [];
    for (const member of members) {
      const keyId = await digest(un64(member.encryptionKey)), info = encode({
        domain: "seruchat/cek-wrap/v2",
        header: h,
        recipientId: member.id,
        keyId
      });
      const context = await hpke.createSenderContext({
        recipientPublicKey: await importPublic(member.encryptionKey, "X25519"),
        info
      });
      wraps.push({
        recipientId: member.id,
        keyId,
        enc: b64(context.enc),
        ciphertext: b64(await context.seal(cek, info))
      });
    }
    return wraps.sort((a, b) => a.recipientId.localeCompare(b.recipientId));
  }
  async function sealPayload(h, context, signingKey, payload, cek, file = null) {
    validateHeader(h, context);
    let iv = crypto.getRandomValues(new Uint8Array(12));
    while (file && b64(iv) === file.iv)
      iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, [
      "encrypt"
    ]);
    const body = {
      header: h,
      iv: b64(iv),
      ciphertext: b64(
        await crypto.subtle.encrypt(
          { name: "AES-GCM", iv, additionalData: aad("seruchat/payload/v2", h) },
          key,
          encode(payload)
        )
      ),
      wraps: await wrapCek(cek, h, context.members),
      file
    };
    return {
      ...body,
      signature: await sign("seruchat/message/v2", body, signingKey)
    };
  }
  async function sealText(context, senderId, signingKey, text) {
    requireTrue(
      typeof text === "string" && te.encode(text).length <= 8192 && text.trim().length > 0,
      "Tin nh\u1EAFn t\u1ED1i \u0111a 8192 bytes."
    );
    const cek = crypto.getRandomValues(new Uint8Array(32));
    try {
      return await sealPayload(
        header(context, senderId),
        context,
        signingKey,
        { text },
        cek
      );
    } finally {
      cek.fill(0);
    }
  }
  async function sealFile(context, senderId, signingKey, bytes, metadata, { messageId = crypto.randomUUID(), attachmentId = crypto.randomUUID() } = {}) {
    const h = header(context, senderId, "file", messageId, attachmentId), cek = crypto.getRandomValues(new Uint8Array(32)), iv = crypto.getRandomValues(new Uint8Array(12));
    try {
      const key = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, [
        "encrypt"
      ]);
      const binary = new Uint8Array(
        await crypto.subtle.encrypt(
          { name: "AES-GCM", iv, additionalData: aad("seruchat/file/v2", h) },
          key,
          bytes
        )
      );
      const file = {
        id: attachmentId,
        iv: b64(iv),
        bytes: binary.length,
        hash: await digest(binary)
      };
      const envelope = await sealPayload(
        h,
        context,
        signingKey,
        { name: metadata.name, mime: metadata.mime, size: bytes.byteLength },
        cek,
        file
      );
      return { envelope, binary };
    } finally {
      cek.fill(0);
    }
  }
  async function verifyEnvelope(e, context) {
    exact(e, ["header", "iv", "ciphertext", "wraps", "file", "signature"]);
    validateHeader(e.header, context);
    un64(e.iv, 12);
    const ct = un64(e.ciphertext, null, 65536);
    requireTrue(ct.length >= 16, "Payload thi\u1EBFu GCM tag.");
    requireTrue(
      Array.isArray(e.wraps) && e.wraps.length === context.members.length && e.wraps.map((w) => w.recipientId).join(",") === context.members.map((m) => m.id).sort().join(","),
      "Wrapped keys kh\xF4ng kh\u1EDBp \u0111\xFAng t\u1EADp th\xE0nh vi\xEAn."
    );
    for (const w of e.wraps) {
      exact(w, ["recipientId", "keyId", "enc", "ciphertext"]);
      uuid(w.recipientId);
      const m = context.members.find((m2) => m2.id === w.recipientId);
      requireTrue(
        w.keyId === await digest(un64(m.encryptionKey)),
        "Kh\xF3a ng\u01B0\u1EDDi nh\u1EADn b\u1ECB thay \u0111\u1ED5i."
      );
      un64(w.enc, 32);
      un64(w.ciphertext, 48);
    }
    if (e.header.type === "file") {
      exact(e.file, ["id", "iv", "bytes", "hash"]);
      requireTrue(
        e.file.id === e.header.attachmentId && Number.isSafeInteger(e.file.bytes) && e.file.bytes >= 16 && e.file.bytes <= 50 * 1024 * 1024 + 16 && /^[a-f0-9]{64}$/.test(e.file.hash),
        "File descriptor sai."
      );
      un64(e.file.iv, 12);
    } else requireTrue(e.file === null, "Text kh\xF4ng ch\u1EE9a file descriptor.");
    const { signature, ...body } = e, sender = context.members.find((m) => m.id === e.header.senderId);
    requireTrue(
      await verify("seruchat/message/v2", body, signature, sender.signingKey),
      "Ch\u1EEF k\xFD tin nh\u1EAFn kh\xF4ng h\u1EE3p l\u1EC7."
    );
    return e;
  }
  async function openEnvelope(e, context, recipientId, privateKey) {
    await verifyEnvelope(e, context);
    const w = e.wraps.find((w2) => w2.recipientId === recipientId);
    requireTrue(w, "B\u1EA1n kh\xF4ng c\xF3 kh\xF3a cho tin n\xE0y.");
    const info = encode({
      domain: "seruchat/cek-wrap/v2",
      header: e.header,
      recipientId,
      keyId: w.keyId
    });
    const receiver = await hpke.createRecipientContext({
      recipientKey: privateKey,
      enc: un64(w.enc, 32),
      info
    });
    const raw = new Uint8Array(await receiver.open(un64(w.ciphertext, 48), info));
    try {
      requireTrue(raw.length === 32, "CEK sai \u0111\u1ED9 d\xE0i.");
      const key = await crypto.subtle.importKey("raw", raw, "AES-GCM", false, [
        "decrypt"
      ]);
      const payload = JSON.parse(
        td.decode(
          await crypto.subtle.decrypt(
            {
              name: "AES-GCM",
              iv: un64(e.iv, 12),
              additionalData: aad("seruchat/payload/v2", e.header)
            },
            key,
            un64(e.ciphertext)
          )
        )
      );
      if (e.header.type === "text") {
        exact(payload, ["text"]);
        requireTrue(
          typeof payload.text === "string" && te.encode(payload.text).length <= 8192,
          "Payload text sai."
        );
      } else {
        exact(payload, ["name", "mime", "size"]);
        requireTrue(
          typeof payload.name === "string" && payload.name.length <= 255 && typeof payload.mime === "string" && payload.mime.length <= 128 && Number.isSafeInteger(payload.size) && payload.size >= 0 && payload.size + 16 === e.file.bytes,
          "Metadata file sai."
        );
      }
      return { payload, key };
    } finally {
      raw.fill(0);
    }
  }
  async function openFile(e, opened, binary) {
    requireTrue(
      e.header.type === "file" && binary.byteLength === e.file.bytes && await digest(binary) === e.file.hash,
      "File b\u1ECB s\u1EEDa ho\u1EB7c t\u1EA3i ch\u01B0a \u0111\u1EE7."
    );
    return crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: un64(e.file.iv, 12),
        additionalData: aad("seruchat/file/v2", e.header)
      },
      opened.key,
      binary
    );
  }
  return __toCommonJS(secure_v2_exports);
})();
/*! Bundled license information:

@hpke/common/esm/src/curve/modular.js:
@hpke/common/esm/src/curve/montgomery.js:
  (*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) *)
*/
