# Security Considerations for Gotenberg Service

## In-Memory Data Handling

This service is designed with security in mind, ensuring that no sensitive data is ever written to disk during document conversion.

### Key Security Features

1. **Pure Streaming Architecture**
   - All file uploads and downloads are streamed directly through the proxy
   - No body parsing middleware is used
   - No temporary files are created on the API gateway

2. **Memory-Based Temporary Storage**
   - Gotenberg container uses `tmpfs` for `/tmp` and `/gotenberg/tmp`
   - All temporary files exist only in RAM
   - Data is automatically cleared when container stops

3. **No Disk Buffering**
   - The Express proxy is configured with `selfHandleResponse: true`
   - Direct piping between request/response streams
   - No middleware that could buffer to disk (e.g., multer)

4. **API Key Authentication**
   - All requests require valid API key
   - Keys are stored in a separate JSON file
   - Keys are removed from headers before forwarding to Gotenberg

5. **Rate Limiting**
   - Prevents abuse and DoS attacks
   - Configurable per-API-key limits

### Data Flow

```
Client → API Gateway → Gotenberg → API Gateway → Client
        (streaming)   (in-memory)   (streaming)
```

No data touches disk at any point in this flow.

### Verification

To verify no disk storage is occurring:

1. Monitor disk I/O during conversions:
   ```bash
   docker exec gotenberg-service iotop
   ```

2. Check that tmpfs is being used:
   ```bash
   docker exec gotenberg-service df -h | grep tmpfs
   ```

3. Inspect running processes:
   ```bash
   docker exec gotenberg-service ps aux
   ```

### Best Practices

1. **Regular Updates**: Keep Gotenberg and all dependencies updated
2. **TLS/HTTPS**: Always use HTTPS in production (see docker-compose.prod.yml)
3. **Network Isolation**: Consider making gotenberg-net internal in production
4. **API Key Rotation**: Regularly rotate API keys
5. **Monitoring**: Monitor memory usage as tmpfs uses RAM

### Memory Considerations

Since we use tmpfs, ensure your server has sufficient RAM:
- Each container can use up to 1GB for temporary files
- Plus the base memory for running the services
- Monitor and adjust tmpfs size based on your document sizes