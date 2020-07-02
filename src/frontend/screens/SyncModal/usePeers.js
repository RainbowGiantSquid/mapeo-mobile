import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react'
import { defineMessages, useIntl, FormattedMessage } from "react-intl";
import { peerStatus } from "./PeerList";
import path from 'path'

const m = defineMessages({
  openSyncFileDialog: 'Select a database to syncronize',
  createSyncFileDialog: 'Create a new database to syncronize',
  // Error message when trying to sync with an incompatible older version of Mapeo
  errorMsgVersionThemBad: '{deviceName} needs to upgrade Mapeo',
  // Error messagewhen trying to sync with an incompatible newer version of Mapeo
  errorMsgVersionUsBad: 'You need to upgrade Mapeo to sync with {deviceName}'
})

module.exports = function usePeers (api, listen, deviceName) {
  const { formatMessage } = useIntl()
  const lastClosed = useRef(Date.now())
  const [serverPeers, setServerPeers] = useState([])
  const [syncErrors, setSyncErrors] = useState(new Map())
  const [syncRequests, setSyncRequests] = useState(new Map())

  // Keep a ref of the last time this view was closed (used to maintain peer
  // "completed" state in the UI)
  useEffect(
    () => {
      if (!listen) lastClosed.current = Date.now()
    },
    [listen]
  )

  useEffect(
    () => {
      // Only start listening if `listen` is true
      if (!listen) return

      const updatePeers = (updatedServerPeers = []) => {
        setServerPeers(updatedServerPeers)
        // NB: use callback version of setState because the new error state
        // depends on the previous error state
        setSyncErrors(syncErrors => {
          const newErrors = new Map(syncErrors)
          updatedServerPeers.forEach(peer => {
            if (peer.state && peer.state.topic === 'replication-error') {
              newErrors.set(peer.id, peer.state)
            }
          })
          return newErrors
        })
        // Argh, this is hacky. This is making up for us not being able to rely
        // on server state for rendering the UI
        setSyncRequests(syncRequests => {
          const newSyncRequests = new Map(syncRequests)
          updatedServerPeers.forEach(peer => {
            if (!peer.state) return
            if (
              (peer.state.topic === 'replication-error' ||
              peer.state.topic === 'replication-complete') && !peer.connected
            ) {
              newSyncRequests.delete(peer.id)
            }
          })
          return newSyncRequests
        })
      }

      // Whenever the sync view becomes focused, announce for sync and start
      // listening for updates to peer status
      api.syncJoin(deviceName)
      const peerListener = api.addPeerListener(updatePeers)

      // When the listen changes or component unmounts, cleanup listeners
      return () => {
        api.syncLeave()
        if (peerListener) peerListener.remove()
      }
    },
    [listen]
  )

  const peers = useMemo(
    () =>
      getPeersStatus({
        syncRequests,
        serverPeers,
        syncErrors,
        since: lastClosed.current,
        formatMessage
      }),
    [serverPeers, syncErrors, syncRequests, formatMessage]
  )

  const syncPeer = useCallback(
    (peerId, opts) => {
      if (opts && opts.file) return api.syncStart({ filename: peerId })
      const peer = serverPeers.find(peer => peer.id === peerId)
      // Peer could have vanished in the moment the button was pressed
      if (peer) {
        // The server does always respond immediately with progress, especially
        // if the two devices are already up to sync. We store the request state
        // so the user can see the UI update when they click the button
        setSyncRequests(syncRequests => {
          const newSyncRequests = new Map(syncRequests)
          newSyncRequests.set(peerId, true)
          return newSyncRequests
        })
        api.syncStart(peer)
      }
    },
    [serverPeers]
  )

  return [peers, syncPeer]
}

/**
 * The peer status from Mapeo Core does not 'remember' the completion of a sync.
 * If the user is not looking at the screen when sync completes, they might miss
 * it. This function derives a peer status from the server state and any errors
 */
function getPeersStatus ({
  serverPeers = [],
  syncErrors,
  syncRequests,
  since,
  formatMessage
}) {
  return serverPeers.map(serverPeer => {
    let status = peerStatus.READY
    let errorMsg
    let complete
    const state = serverPeer.state || {}
    const name = serverPeer.filename
      ? path.basename(serverPeer.name)
      : serverPeer.name
    if (
      state.topic === 'replication-progress' ||
      state.topic === 'replication-started' ||
      syncRequests.has(serverPeer.id)
    ) {
      status = peerStatus.PROGRESS
    } else if (
      (state.lastCompletedDate || 0) > since ||
      state.topic === 'replication-complete'
    ) {
      status = peerStatus.COMPLETE
      complete = state.message
    } else if (
      syncErrors.has(serverPeer.id) ||
      state.topic === 'replication-error'
    ) {
      status = peerStatus.ERROR
      const error = syncErrors.get(serverPeer.id)
      if (error && error.code === 'ERR_VERSION_MISMATCH') {
        if (
          parseVersionMajor(state.usVersion || '') >
          parseVersionMajor(state.themVersion || '')
        ) {
          errorMsg = formatMessage(m.errorMsgVersionThemBad, {
            deviceName: name
          })
        } else {
          errorMsg = formatMessage(m.errorMsgVersionUsBad, { deviceName: name })
        }
      } else if (error) {
        errorMsg = error.message || 'Error'
      }
    }
    return {
      id: serverPeer.id,
      name: name,
      status: status,
      started: serverPeer.started,
      connected: serverPeer.connected,
      lastCompleted: complete || state.lastCompletedDate,
      errorMsg: errorMsg,
      progress: getPeerProgress(serverPeer.state),
      deviceType: serverPeer.filename ? 'file' : serverPeer.deviceType
    }
  })
}

// We combine media and database items in progress. In order to show roughtly
// accurate progress, this weighting is how much more progress a media item
// counts vs. a database item
const MEDIA_WEIGHTING = 50
function getPeerProgress (peerState) {
  if (
    !peerState ||
    peerState.topic !== 'replication-progress' ||
    !peerState.message ||
    !peerState.message.db ||
    !peerState.message.media
  ) {
    return
  }
  const total =
    (peerState.message.db.total || 0) +
    (peerState.message.media.total || 0) * MEDIA_WEIGHTING
  const sofar =
    (peerState.message.db.sofar || 0) +
    (peerState.message.media.sofar || 0) * MEDIA_WEIGHTING
  const progress = total > 0 ? sofar / total : 0
  // Round progress to 2-decimal places. PeerItem is memoized, so it will not
  // update if progress does not change. Without rounding PeerItem updates
  // unnecessarily on every progress change, when we are only showing the user a
  // rounded percentage progress. Increase this to 3-decimal places if you want
  // to show more detail to the user.
  return {
    percent: Math.round(progress * 100) / 100,
    mediaSofar: peerState.message.media.sofar || 0,
    mediaTotal: peerState.message.media.total || 0,
    dbSofar: peerState.message.db.sofar || 0,
    dbTotal: peerState.message.db.total || 0
  }
}

export function parseVersionMajor (versionString = '') {
  const major = Number.parseInt(versionString.split('.')[0])
  return isNaN(major) ? 0 : major
}
