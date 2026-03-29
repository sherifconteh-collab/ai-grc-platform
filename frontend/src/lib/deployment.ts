'use client';

import axios from 'axios';
import { useEffect, useState } from 'react';
import { getApiBaseUrl } from './apiBase';

export interface DeploymentInfo {
  edition: 'community' | 'pro' | 'enterprise';
  isCommunity: boolean;
  isPro: boolean;
  isSelfHosted: boolean;
  marketingSiteEnabled: boolean;
}

const MARKETING_SITE_ENABLED = ['1', 'true', 'yes', 'on'].includes(
  String(process.env.NEXT_PUBLIC_ENABLE_MARKETING_SITE || '').trim().toLowerCase()
);

const DEFAULT_DEPLOYMENT_INFO: DeploymentInfo = {
  edition: MARKETING_SITE_ENABLED ? 'pro' : 'community',
  isCommunity: !MARKETING_SITE_ENABLED,
  isPro: MARKETING_SITE_ENABLED,
  isSelfHosted: !MARKETING_SITE_ENABLED,
  marketingSiteEnabled: MARKETING_SITE_ENABLED,
};

let cachedDeploymentInfo: DeploymentInfo | null = null;
let pendingDeploymentInfoRequest: Promise<DeploymentInfo> | null = null;

function normalizeEdition(value: unknown): DeploymentInfo['edition'] {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'enterprise') return 'enterprise';
  if (normalized === 'pro') return 'pro';
  return 'community';
}

function getEditionEndpoint(): string {
  return getApiBaseUrl().replace(/\/api\/v1\/?$/i, '') + '/edition';
}

function normalizeDeploymentInfo(payload: unknown): DeploymentInfo {
  const data = (payload && typeof payload === 'object' ? payload : {}) as Record<string, unknown>;
  const edition = normalizeEdition(data.edition);

  return {
    edition,
    isCommunity: Boolean(data.isCommunity ?? (edition === 'community')),
    isPro: Boolean(data.isPro ?? (edition === 'pro' || edition === 'enterprise')),
    isSelfHosted: !MARKETING_SITE_ENABLED,
    marketingSiteEnabled: MARKETING_SITE_ENABLED,
  };
}

export async function loadDeploymentInfo(): Promise<DeploymentInfo> {
  if (cachedDeploymentInfo) {
    return cachedDeploymentInfo;
  }

  if (MARKETING_SITE_ENABLED) {
    cachedDeploymentInfo = DEFAULT_DEPLOYMENT_INFO;
    return cachedDeploymentInfo;
  }

  if (!pendingDeploymentInfoRequest) {
    pendingDeploymentInfoRequest = axios
      .get(getEditionEndpoint(), {
        timeout: 5000,
      })
      .then((response) => {
        cachedDeploymentInfo = normalizeDeploymentInfo(response.data);
        return cachedDeploymentInfo;
      })
      .catch(() => {
        cachedDeploymentInfo = DEFAULT_DEPLOYMENT_INFO;
        return cachedDeploymentInfo;
      })
      .finally(() => {
        pendingDeploymentInfoRequest = null;
      });
  }

  return pendingDeploymentInfoRequest;
}

export function useDeploymentInfo() {
  const [deploymentInfo, setDeploymentInfo] = useState<DeploymentInfo>(
    cachedDeploymentInfo || DEFAULT_DEPLOYMENT_INFO
  );
  const [loading, setLoading] = useState<boolean>(!cachedDeploymentInfo && !MARKETING_SITE_ENABLED);

  useEffect(() => {
    let active = true;

    loadDeploymentInfo().then((info) => {
      if (!active) {
        return;
      }

      setDeploymentInfo(info);
      setLoading(false);
    });

    return () => {
      active = false;
    };
  }, []);

  return { deploymentInfo, loading };
}
