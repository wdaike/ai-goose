use super::*;

impl HandleDispatchFrom<Client> for GooseAcpHandler {
    fn describe_chain(&self) -> impl std::fmt::Debug {
        "goose-acp"
    }

    fn handle_dispatch_from(
        &mut self,
        message: Dispatch,
        cx: ConnectionTo<Client>,
    ) -> impl std::future::Future<Output = Result<Handled<Dispatch>, agent_client_protocol::Error>> + Send
    {
        let agent = self.agent.clone();

        // The MatchDispatchFrom chain produces an ~85KB async state machine.
        // Box::pin moves it to the heap so it doesn't overflow the tokio worker stack.
        Box::pin(async move {
            // Capture the connection handle so handlers can lazily activate
            // sessions that exist on disk but were never activated via
            // new_session/load_session on this connection. Set-once per
            // connection; the result is ignored on later requests.
            let _ = agent.client_cx.set(cx.clone());

            // InitializeRequest runs inline: it sets connection-scoped state
            // (client fs/terminal capabilities) that later handlers read with
            // defaults, so a pipelined NewSessionRequest must not race ahead of it.
            MatchDispatchFrom::new(message, &cx)
                .if_request(
                    |req: InitializeRequest, responder: Responder<InitializeResponse>| async {
                        responder.respond_with_result(agent.on_initialize(req).await)
                    },
                )
                .await
                .if_request(
                    |_req: AuthenticateRequest, responder: Responder<AuthenticateResponse>| async {
                        responder.respond(AuthenticateResponse::new())
                    },
                )
                .await
                .if_request(
                    |req: NewSessionRequest, responder: Responder<NewSessionResponse>| async {
                        let agent = agent.clone();
                        let cx_clone = cx.clone();
                        cx.spawn(async move {
                            responder.respond_with_result(agent.on_new_session(&cx_clone, req).await)?;
                            Ok(())
                        })?;
                        Ok(())
                    },
                )
                .await
                .if_request(
                    |req: LoadSessionRequest, responder: Responder<LoadSessionResponse>| async {
                        let agent = agent.clone();
                        let cx_clone = cx.clone();
                        cx.spawn(async move {
                            let session_id = req.session_id.0.to_string();
                            match agent.on_load_session(&cx_clone, req).await {
                                Ok(response) => {
                                    responder.respond(response)?;
                                }
                                Err(e) => {
                                    tracing::error!(
                                        session_id = %session_id,
                                        error = ?e,
                                        "ACP load_session failed"
                                    );
                                    responder.respond_with_error(e)?;
                                }
                            }
                            Ok(())
                        })?;
                        Ok(())
                    },
                )
                .await
                .if_request(
                    |req: PromptRequest, responder: Responder<PromptResponse>| async {
                        let agent = agent.clone();
                        let cx_clone = cx.clone();
                        cx.spawn(async move {
                            match agent.on_prompt(&cx_clone, req).await {
                                Ok(response) => {
                                    responder.respond(response)?;
                                }
                                Err(e) => {
                                    responder.respond_with_error(e)?;
                                }
                            }
                            Ok(())
                        })?;
                        Ok(())
                    },
                )
                .await
                .if_notification(|notif: CancelNotification| async {
                    let agent = agent.clone();
                    agent.on_cancel(notif).await?;
                    Ok(())
                })
                .await
                // set_config_option (SACP 11) and set_mode; custom _goose/* in otherwise.
                .if_request({
                    let agent = agent.clone();
                    let cx = cx.clone();
                    |req: SetSessionConfigOptionRequest, responder: Responder<SetSessionConfigOptionResponse>| async move {
                        let cx_spawn = cx.clone();
                        cx.spawn(async move {
                            let cx = cx_spawn;
                            let value_id = req.value.as_value_id()
                                .ok_or_else(|| agent_client_protocol::Error::invalid_params().data("Expected a value ID"))?
                                .clone();
                            let session_id = req.session_id.clone();
                            let sid = sid_short(session_id.0.as_ref());
                            let config_id = req.config_id.0.to_string();
                            let t_handler = std::time::Instant::now();
                            match config_id.as_ref() {
                                "provider" => {
                                    Config::global().invalidate_secrets_cache();
                                    match agent.update_provider(&session_id.0, &value_id.0, None, None, None).await {
                                        Ok(_) => {}
                                        Err(e) => { responder.respond_with_error(e)?; return Ok(()); }
                                    }
                                }
                                "mode" => {
                                    match agent.on_set_mode(&session_id.0, &value_id.0).await {
                                        Ok(_) => {}
                                        Err(e) => { responder.respond_with_error(e)?; return Ok(()); }
                                    }
                                }
                                "model" => {
                                    match agent.on_set_model(&session_id.0, &value_id.0).await {
                                        Ok(_) => {}
                                        Err(e) => { responder.respond_with_error(e)?; return Ok(()); }
                                    }
                                }
                                "thinking_effort" => {
                                    match agent.on_set_thinking_effort(&session_id.0, &value_id.0).await {
                                        Ok(_) => {}
                                        Err(e) => { responder.respond_with_error(e)?; return Ok(()); }
                                    }
                                }
                                other => {
                                    responder.respond_with_error(
                                        agent_client_protocol::Error::invalid_params().data(format!("Unsupported config option: {}", other))
                                    )?;
                                    return Ok(());
                                }
                            }
                            let (notification, config_options) = agent.build_config_update(&session_id).await?;
                            cx.send_notification(notification)?;
                            responder.respond(SetSessionConfigOptionResponse::new(config_options))?;


                            debug!(target: "perf", sid = %sid, ms = t_handler.elapsed().as_millis() as u64, config_id = %config_id, "perf: set_config_option done");
                            Ok(())
                        })?;
                        Ok(())
                    }
                })
                .await
                .if_request({
                    let agent = agent.clone();
                    let cx = cx.clone();
                    |req: SetSessionModeRequest, responder: Responder<SetSessionModeResponse>| async move {
                        let cx_spawn = cx.clone();
                        cx.spawn(async move {
                            let cx = cx_spawn;
                            let session_id = req.session_id.clone();
                            let mode_id = req.mode_id.clone();
                            match agent.on_set_mode(&session_id.0, &mode_id.0).await {
                                Ok(resp) => {
                                    // Notify before responding so clients see the mode update before block_task unblocks.
                                    cx.send_notification(SessionNotification::new(
                                        session_id,
                                        SessionUpdate::CurrentModeUpdate(
                                            CurrentModeUpdate::new(mode_id),
                                        ),
                                    ))?;
                                    responder.respond(resp)?;
                                }
                                Err(e) => {
                                    responder.respond_with_error(e)?;
                                }
                            }
                            Ok(())
                        })?;
                        Ok(())
                    }
                })
                .await
                .if_request({
                    let agent = agent.clone();
                    let cx = cx.clone();
                    |req: ListSessionsRequest, responder: Responder<ListSessionsResponse>| async move {
                        cx.spawn(async move {
                            match agent.on_list_sessions(req).await {
                                Ok(response) => responder.respond(response)?,
                                Err(e) => responder.respond_with_error(e)?,
                            }
                            Ok(())
                        })?;
                        Ok(())
                    }
                })
                .await
                .if_request({
                    let agent = agent.clone();
                    let cx = cx.clone();
                    |req: CloseSessionRequest, responder: Responder<CloseSessionResponse>| async move {
                        cx.spawn(async move {
                            responder.respond(agent.on_close_session(&req.session_id.0).await?)?;
                            Ok(())
                        })?;
                        Ok(())
                    }
                })
                .await
                .if_request({
                    let agent = agent.clone();
                    let cx = cx.clone();
                    |req: ForkSessionRequest, responder: Responder<ForkSessionResponse>| async move {
                        let cx_spawn = cx.clone();
                        cx.spawn(async move {
                            responder.respond_with_result(agent.on_fork_session(&cx_spawn, req).await)?;
                            Ok(())
                        })?;
                        Ok(())
                    }
                })
                .await
                .otherwise({
                    let agent = agent.clone();
                    let cx = cx.clone();
                    |message: Dispatch| async move {
                        match message {
                            Dispatch::Request(req, responder) => {
                                cx.spawn(async move {
                                    match agent.dispatch_custom_request(&req.method, req.params).await {
                                        Ok(json) => responder.respond(json)?,
                                        Err(e) => responder.respond_with_error(e)?,
                                    }
                                    Ok(())
                                })?;
                                Ok(())
                            }
                            Dispatch::Response(result, router) => {
                                debug!(method = %router.method(), id = %router.id(), ok = result.is_ok(), "routing response");
                                router.respond_with_result(result)?;
                                Ok(())
                            }
                            Dispatch::Notification(notif) => {
                                debug!(method = %notif.method, "unhandled notification");
                                Ok(())
                            }
                        }
                    }
                })
                .await
                .map(|()| Handled::Yes)
        })
    }
}
