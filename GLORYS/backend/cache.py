"""
ADRISHTA: Intelligent Multi-Tier Caching Engine
Supports in-memory LRU caching with optional Redis backend.
"""

import os
import json
import logging
from typing import Optional, Any
from functools import lru_cache

logger = logging.getLogger("adrishta.cache")

class OceanCache:
    def __init__(self):
        self.redis_client = None
        self.use_redis = False
        self._memory_store = {}
        
        # Check if Redis requested via env
        if os.getenv("ENABLE_REDIS", "false").lower() in ("true", "1", "yes"):
            try:
                import redis
                host = os.getenv("REDIS_HOST", "localhost")
                port = int(os.getenv("REDIS_PORT", 6379))
                db = int(os.getenv("REDIS_DB", 0))
                
                client = redis.Redis(host=host, port=port, db=db, socket_timeout=0.5)
                if client.ping():
                    self.redis_client = client
                    self.use_redis = True
                    print("[OK] Connected to Redis Cache")
            except Exception as e:
                self.use_redis = False

    def get(self, key: str) -> Optional[Any]:
        if self.use_redis and self.redis_client:
            try:
                val = self.redis_client.get(key)
                if val:
                    return json.loads(val.decode("utf-8"))
            except Exception as e:
                logger.warning(f"Redis get failed: {e}")
        return self._memory_store.get(key)

    def set(self, key: str, value: Any, ttl_seconds: int = 86400):
        if self.use_redis and self.redis_client:
            try:
                self.redis_client.setex(key, ttl_seconds, json.dumps(value))
                return
            except Exception as e:
                logger.warning(f"Redis set failed: {e}")
        if len(self._memory_store) > 100:
            self._memory_store.clear()
        self._memory_store[key] = value

    def clear(self):
        if self.use_redis and self.redis_client:
            try:
                self.redis_client.flushdb()
            except Exception:
                pass
        self._memory_store.clear()

cache = OceanCache()
