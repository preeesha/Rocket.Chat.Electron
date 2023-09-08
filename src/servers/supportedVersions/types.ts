import jwt from 'jsonwebtoken';
import moment from 'moment';
import { satisfies } from 'semver';

import { dispatch } from '../../store';
import { SUPPORTED_VERSION_EXPIRATION_MESSAGE_UPDATED } from '../../ui/actions';
import type { Server } from '../common';
import {
  builtinSupportedVersionsJWT,
  sampleCloudInfo,
  sampleServerSupportedVersions,
} from './samples';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export type SerializedJWT<T> = string;

export type Dictionary = {
  [lng: string]: Record<string, string>;
};

export type Message = {
  remainingDays: number;
  title: string;
  subtitle: string;
  description: string;
  type: 'primary' | 'warning' | 'danger';
  params: Record<string, unknown> & {
    instance_ws_name?: string;
    instance_username?: string;
    instance_email?: string;
    instance_domain?: string;
    remaining_days?: number;
  };
  link: string;
};

export type MessageTranslated = {
  title?: string;
  subtitle?: string;
  description?: string;
  link?: string;
};

export type Version = {
  version: string;
  expiration: Date;
  messages?: Message[];
};

export interface SupportedVersions {
  timestamp: string;
  messages?: Message[];
  versions: Version[];
  exceptions?: {
    domain: string;
    uniqueId: string;
    messages?: Message[];
    versions: Version[];
  };
  i18n?: Dictionary;
}

export interface ServerInfo {
  info?: {
    // only for authenticated users
    version: string;
    build: {
      date: string;
      nodeVersion: string;
      arch: string;
      platform: string;
      osRelease: string;
      totalMemory: number;
      freeMemory: number;
      cpus: number;
    };
    marketplaceApiVersion: string;
    commit: {
      hash: string;
      date: Date;
      author: string;
      subject: string;
      tag: string;
      branch: string;
    };
  };
  success: boolean;
  supportedVersions?: SerializedJWT<SupportedVersions>;
  minimumClientVersions?: {
    desktop: string;
    mobile: string;
  };
}

export interface CloudInfo {
  signed: SerializedJWT<SupportedVersions>;
  timestamp: string;
  messages?: Message[];
  versions: Version[];
  exceptions?: {
    domain: string;
    uniqueId: string;
    messages?: Message[];
    versions: Version[];
  };
}

const publicKey = `
-----BEGIN PUBLIC KEY-----
MIICIjANBgkqhkiG9w0BAQEFAAOCAg8AMIICCgKCAgEArbSdeyXHhgBAX93ndDDxCuMhIh9XYCJUHG+vGNKzl4i16W5Fj5bua5gSxbIdhl0S7BtYJM3trpp7vnf3Cp6+tFoyKREYr8D/sdznSv7nRgZGgcuwZpXwf3bPN69dPPZvKS9exhlQ13nn1kOUYOgRwOrdZ8sFzJTasKeTCEjEZa4UFU4Q5lvJGOQt7hA3TvFmH4RUQC7Cu8GgHfUQD4fDuRqG4KFteTOJABpvXqJJG7DWiX6N5ssh2qRoaoapK7E+bTYWAzQnR9eAFV1ajCjhm2TqmUbAKWCM2X27ArsCJ9SWzDIj7sAm0G3DtbUKnzCDmZQHXlxcXcMDqWb8w+JQFs8b4pf56SmZn1Bro7TxdXBEgRQCTck1hginBTKciuh8gbv71bLyjPxOxnAQaukxhYpZPJAFrsfps0vKp1EPwNTboDLHHeuGSeaBP/c8ipHqPmraFLR78O07EdsCzJpBvggG7GcgSikjWDjK/eIdsUro7BKFmxjrmT72dmr7Ero9cmtd1aO/6PAenwHafCKnaxGcIGLUCNOXhk+uTPoV2LrN4L5LN75NNu6hd5L4++ngjwVsGsX3JP3seFPaZ2C76TD+Rd6OT+8guZFCGjPzXbDAb6ScQUJb11pyyLooPkz7Xdy5fCBRoeIWtjs6UwH4n57SJ/gkzkmUykX0WT3wqhkCAwEAAQ==
-----END PUBLIC KEY-----`;

function decode(token: string) {
  const decoded = jwt.verify(token, publicKey, { algorithms: ['RS256'] });
  return decoded;
}

function readBuiltinSupportedVersions(): SupportedVersions {
  try {
    // const builtinSupportedVersionsJWT = fs.readFileSync(
    //   'supportedVersions.jwt',
    //   'utf8'
    // );
    return decode(builtinSupportedVersionsJWT) as SupportedVersions;
  } catch (e) {
    console.log('Error loading supportedVersions.jwt', e);
    return sampleServerSupportedVersions;
  }
}

const getCloudInfo = (_workspaceId: string): SupportedVersions => {
  // get cloud info from server
  const cloudInfo = sampleCloudInfo;
  const decoded = decode(cloudInfo.signed) as SupportedVersions;
  return decoded;
};

export const getServerInfo = (serverUrl: string): Promise<ServerInfo | null> =>
  fetch(`${serverUrl}/api/info`)
    .then((response) => {
      if (!response.ok) {
        throw new Error(`Couldn't load Server Info: ${response.status}`);
      }
      return response.json();
    })
    .then((data) => {
      console.log(data);
      return data as ServerInfo;
    })
    .catch((error) => {
      console.error('Fetching Server Info error:', error);
      return null;
    });

export const getSupportedVersionsData = async (
  server: Server
): Promise<SupportedVersions> => {
  const { supportedVersions } = server;
  const buildSupportedVersions = await readBuiltinSupportedVersions();
  if (!supportedVersions || !server.workspaceUID) {
    return buildSupportedVersions;
  }
  if (!supportedVersions || server.workspaceUID) {
    const cloudInfo = await getCloudInfo(server.workspaceUID);
    return cloudInfo;
  }
  // const decodedServerSupportedVersions = decode(
  //   supportedVersions
  // ) as SupportedVersions;
  const decodedServerSupportedVersions = supportedVersions;
  if (
    !decodedServerSupportedVersions ||
    decodedServerSupportedVersions.timestamp < buildSupportedVersions?.timestamp
  )
    return buildSupportedVersions;

  return decodedServerSupportedVersions;
};

export const getExpirationMessage = ({
  messages,
  expiration,
}: {
  messages?: Message[];
  expiration?: Date;
}): Message | undefined => {
  if (
    !messages?.length ||
    !expiration ||
    moment(expiration).diff(new Date(), 'days') < 0
  ) {
    return;
  }
  const sortedMessages = messages.sort(
    (a, b) => a.remainingDays - b.remainingDays
  );
  const message = sortedMessages.find(
    ({ remainingDays }) =>
      moment(expiration).diff(new Date(), 'days') <= remainingDays
  );
  return message;
};

export const getExpirationMessageTranslated = (
  i18n: Dictionary | undefined,
  message: Message,
  expiration: Date,
  language: string,
  // username: string,
  // email: string,
  serverName: Server['title'],
  serverUrl: Server['url']
) => {
  const applyParams = (message: string, params: Record<string, unknown>) => {
    const keys = Object.keys(params);
    const regex = new RegExp(`{{(${keys.join('|')})}}`, 'g');
    return message.replace(regex, (_, p1) => params[p1] as string);
  };

  const params = {
    // instance_username: username,
    // instance_email: email,
    instance_ws_name: serverName,
    instance_domain: serverUrl,
    remaining_days: moment(expiration).diff(new Date(), 'days'),
    ...message?.params,
  };

  if (!message || !i18n || params.remaining_days > 15) {
    return null;
  }

  const i18nLang = i18n[language] ?? i18n.en;

  const getTranslation = (key: string) =>
    key && i18nLang[key] ? applyParams(i18nLang[key], params) : undefined;

  const translatedMessage = {
    title: getTranslation(message.title),
    subtitle: getTranslation(message.subtitle),
    description: getTranslation(message.description),
    link: message.link,
  };

  return translatedMessage;
};

export const isServerVersionSupported = async (
  server: Server
): Promise<boolean> => {
  const { versions, exceptions } = await getSupportedVersionsData(server);
  const serverVersion = server.version;
  if (!serverVersion) return false;

  // 1.2.3 -> ~1.2
  const serverVersionTilde = `~${serverVersion
    .split('.')
    .slice(0, 2)
    .join('.')}`;

  const supportedVersion = versions.find(({ version }) =>
    satisfies(version, serverVersionTilde)
  );

  if (supportedVersion) {
    if (new Date(supportedVersion.expiration) > new Date()) {
      const selectedExpirationMessage = getExpirationMessage({
        messages: supportedVersion.messages,
        expiration: supportedVersion.expiration,
      }) as Message;

      const translatedMessage = getExpirationMessageTranslated(
        server.supportedVersions?.i18n,
        selectedExpirationMessage,
        supportedVersion.expiration,
        'en',
        server.title,
        server.url
      ) as MessageTranslated;

      dispatch({
        type: SUPPORTED_VERSION_EXPIRATION_MESSAGE_UPDATED,
        payload: {
          url: server.url,
          expirationMessage: translatedMessage,
        },
      });
      return true;
    }
  }

  const exception = exceptions?.versions.find(({ version }) =>
    satisfies(version, serverVersionTilde)
  );

  if (exception) {
    if (new Date(exception.expiration) > new Date()) {
      const selectedExpirationMessage = getExpirationMessage({
        messages: exception.messages,
        expiration: exception.expiration,
      }) as Message;

      const translatedMessage = getExpirationMessageTranslated(
        server.supportedVersions?.i18n,
        selectedExpirationMessage,
        exception.expiration,
        'en',
        server.title,
        server.url
      ) as MessageTranslated;

      dispatch({
        type: SUPPORTED_VERSION_EXPIRATION_MESSAGE_UPDATED,
        payload: {
          url: server.url,
          expirationMessage: translatedMessage,
        },
      });
      return true;
    }
  }

  return false;
};
