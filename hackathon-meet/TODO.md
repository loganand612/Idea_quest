# TODO - Video Call Testing and Debugging

## Steps to Test Video Call

1. Start signaling server:
   ```
   node signaling.js
   ```
2. Start static server:
   ```
   npm run start-server
   ```
3. Open two browser windows or tabs at:
   ```
   http://localhost:3000
   ```
4. Verify:
   - Both peers connect to signaling server (check signaling server logs).
   - Offers and answers are exchanged (check browser console logs).
   - ICE candidates are exchanged.
   - Remote video stream appears on each peer.
   - No errors in browser console or server terminals.
5. Test leave call button functionality.

## Observations and Issues

- [ ] Check if signaling server logs client connections.
- [ ] Check if ICE candidates are exchanged.
- [ ] Check if remote track event fires and remote video srcObject is set.
- [ ] Check for any errors or warnings.

## Next Steps

- Debug and fix any issues found during testing.
- Confirm receiver video appears correctly.
- Perform thorough testing of all video call features.
