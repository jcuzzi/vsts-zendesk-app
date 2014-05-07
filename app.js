//********************************************************* 
// 
// Copyright (c) Microsoft. All rights reserved. 
// THIS CODE IS PROVIDED *AS IS* WITHOUT WARRANTY OF 
// ANY KIND, EITHER EXPRESS OR IMPLIED, INCLUDING ANY 
// IMPLIED WARRANTIES OF FITNESS FOR A PARTICULAR 
// PURPOSE, MERCHANTABILITY, OR NON-INFRINGEMENT. 
// 
//********************************************************* 

(function (window) {
    'use strict';

    //#region Constants

    var
        INSTALLATION_ID = 0,    //For dev purposes, when using Zat, set this to your current installation id
        VSO_URL_FORMAT = "https://%@.visualstudio.com/DefaultCollection",
        TAG_PREFIX = "vso_wi_",
        VSO_TO_ZENDESK_COMMENT_BEGINS_WITH = "Zendesk:",
        DEFAULT_FIELD_SETTINGS = JSON.stringify({
            "System.WorkItemType": { summary: true, details: true },
            "System.Title": { summary: false, details: true },
            "System.Description": { summary: true, details: true }
        }),
        VSO_ZENDESK_LINK_TO_TICKET_PREFIX = "ZendeskLinkTo_Ticket_",
        VSO_ZENDESK_LINK_TO_TICKET_ATTACHMENT_PREFIX = "ZendeskLinkTo_Attachment_Ticket_",
        VSO_WI_TYPES_WHITE_LISTS = ["Bug", "Product Backlog Item", "User Story", "Requirement", "Issue"],

        VSO_WI_TYPES_INCLUDE_FIELDS = {
            "SCRUM": {
                "Bug": [
                    { field: { refName: "System.State" }, value: "New" },
                    { field: { refName: "System.Reason" }, value: "New defect reported" },
                ],
                "Product Backlog Item": [
                    { field: { refName: "System.State" }, value: "New" },
                    { field: { refName: "System.Reason" }, value: "New backlog item" }
                ]
            },
            "MSF": {
                "Bug": [
                    { field: { refName: "System.State" }, value: "Active" },
                    { field: { refName: "System.Reason" }, value: "New" },
                    { field: { refName: "Microsoft.VSTS.Common.ActivatedBy" }, valueReader: "getUserName" }
                ],
                "Issue": [
                    { field: { refName: "System.State" }, value: "Active" },
                    { field: { refName: "System.Reason" }, value: "New" },
                    { field: { refName: "Microsoft.VSTS.Common.ActivatedBy" }, valueReader: "getUserName" }
                ],
                "User Story": [
                    { field: { refName: "System.State" }, value: "New" },
                    { field: { refName: "System.Reason" }, value: "New" },
                ]
            },
            "CMMI": {
                "Bug": [
                    { field: { refName: "System.State" }, value: "Proposed" },
                    { field: { refName: "System.Reason" }, value: "New" },
                    { field: { refName: "Microsoft.VSTS.Common.Priority" }, value: "2" },
                    { field: { refName: "Microsoft.VSTS.Common.Triage" }, value: "Pending" },
                ],
                "Issue": [
                    { field: { refName: "System.State" }, value: "Proposed" },
                    { field: { refName: "System.Reason" }, value: "New" },
                    { field: { refName: "Microsoft.VSTS.Common.Priority" }, value: "2" },
                    { field: { refName: "Microsoft.VSTS.Common.Triage" }, value: "Pending" },
                ],
                "Requirement": [
                    { field: { refName: "System.State" }, value: "Proposed" },
                    { field: { refName: "System.Reason" }, value: "New" },
                    { field: { refName: "Microsoft.VSTS.Common.Priority" }, value: "2" },
                    { field: { refName: "Microsoft.VSTS.Common.Triage" }, value: "Pending" },
                    { field: { refName: "Microsoft.VSTS.CMMI.RequirementType" }, value: "Functional" },
                    { field: { refName: "Microsoft.VSTS.CMMI.Committed" }, value: "No" },
                    { field: { refName: "Microsoft.VSTS.CMMI.UserAcceptanceTest" }, value: "Not Ready" }
                ]
            }
        };
    //#endregion

    return {
        defaultState: 'loading',

        //Global view model shared by all instances
        vm: {
            projects: [],
            fields: [],
            fieldSettings: {},
            userProfile: {},
            isAppLoadedOk: false
        },

        //Readers for specific work item fields
        workItemFieldValueReaders: {
            getUserName: function () { return this.vm.userProfile.DisplayName; }
        },

        //#region Events Declaration
        events: {
            // App
            'app.activated': 'onAppActivated',

            // Requests
            'getVsoUserProfileWithTwa.done': 'onGetVsoUserProfileWithTwaDone',
            'getVsoProjectsWithTwa.done': 'onGetVsoProjectsWithTwaDone',
            'getVsoFieldsWithTwa.done': 'onGetVsoFieldsWithTwaDone',

            //New workitem dialog
            'click .newWorkItem': 'onNewWorkItemClick',
            'change #newWorkItemModal .inputVsoProject': 'onNewVsoProjectChange',
            'change #newWorkItemModal #type': 'onNewVsoWorkItemTypeChange',
            'click #newWorkItemModal .copyDescription': 'onNewCopyDescriptionClick',
            'click #newWorkItemModal .accept': 'onNewWorkItemAcceptClick',

            //Admin side pane
            'click .cog': 'onCogClick',
            'click .closeAdmin': 'onCloseAdminClick',
            'change .summary,.details': 'onSettingChange',

            //Details dialog
            'click .showDetails': 'onShowDetailsClick',

            //Link work item dialog
            'click .link': 'onLinkClick',
            'change #linkModal #project': 'onLinkVsoProjectChange',
            'click #linkModal button.query': 'onLinkQueryButtonClick',
            'click #linkModal button.accept': 'onLinkAcceptClick',
            'click #linkModal button.search': 'onLinkSearchClick',
            'click #linkModal a.workItemResult': 'onLinkResultClick',

            //Unlink click
            'click .unlink': 'onUnlinkClick',
            'click #unlinkModal .accept': 'onUnlinkAcceptClick',

            //Notify dialog
            'click .notify': 'onNotifyClick',
            'click #notifyModal .accept': 'onNotifyAcceptClick',
            'click #notifyModal .copyLastComment': 'onCopyLastCommentClick',

            //Refresh work items
            'click #refreshWorkItemsLink': 'onRefreshWorkItemClick',

            //Login
            'click .user,.user-link': 'onUserIconClick',
            'click .closeLogin': 'onCloseLoginClick',
            'click .login-button': 'onLoginClick'
        },

        //#endregion

        //#region Requests
        requests: {
            getComments: function () {
                return {
                    url: helpers.fmt('/api/v2/tickets/%@/comments.json', this.ticket().id()),
                    type: 'GET'
                };
            },

            addTagToTicket: function (tag) {
                return {
                    url: helpers.fmt('/api/v2/tickets/%@/tags.json', this.ticket().id()),
                    type: 'PUT',
                    dataType: 'json',
                    data: {
                        "tags": [tag]
                    }
                };
            },

            removeTagFromTicket: function (tag) {
                return {
                    url: helpers.fmt('/api/v2/tickets/%@/tags.json', this.ticket().id()),
                    type: 'DELETE',
                    dataType: 'json',
                    data: {
                        "tags": [tag]
                    }
                };
            },

            addPrivateCommentToTicket: function (text) {
                return {
                    url: helpers.fmt('/api/v2/tickets/%@.json', this.ticket().id()),
                    type: 'PUT',
                    dataType: 'json',
                    data: {
                        "ticket": {
                            "comment": {
                                "public": false,
                                "body": text
                            }
                        }
                    }
                };
            },

            saveSettings: function (data) {
                return {
                    type: 'PUT',
                    url: helpers.fmt("/api/v2/apps/installations/%@.json", this.installationId() || INSTALLATION_ID),
                    dataType: 'json',
                    data: {
                        enabled: true,
                        settings: data
                    }
                };
            },

            getVsoUserProfileWithTwa: function () { return this.vsoRequest('/_api/_common/getUserProfile?__v=5'); },
            getVsoProjectsWithTwa: function () { return this.vsoRequest('/_api/_wit/teamProjects?__v=5'); },
            getVsoProjectWorkItemTypes: function (projectName) { return this.vsoRequest(helpers.fmt('/%@/_api/_wit/workItemTypes?__v=5', projectName)); },
            getVsoProjectWorkItemQueries: function (projectName) { return this.vsoRequest('/_apis/wit/queries', { project: projectName, $depth: 1000 }); },
            getVsoFieldsWithTwa: function () { return this.vsoRequest('/_api/_wit/fields?__v=5'); },
            getVsoWorkItems: function (ids) { return this.vsoRequest('/_apis/wit/workItems', { ids: ids, '$expand': 'resourceLinks' }); },
            getVsoWorkItem: function (workItemId) { return this.vsoRequest(helpers.fmt('/_apis/wit/workItems/%@', workItemId), { '$expand': 'resourceLinks' }); },
            getVsoWorkItemQueryResult: function (queryId) {
                return this.vsoRequest('/_apis/wit/queryResults', undefined, {
                    type: 'POST',
                    contentType: 'application/json',
                    data: JSON.stringify({
                        id: queryId
                    })
                });
            },
            createVsoWorkItem: function (data) {
                return this.vsoRequest('/_apis/wit/workItems', undefined, {
                    type: 'POST',
                    contentType: 'application/json',
                    data: JSON.stringify(data)
                });
            },

            updateVsoWorkItem: function (workItemId, data) {
                return this.vsoRequest(helpers.fmt('/_apis/wit/workItems/%@', workItemId), undefined, {
                    type: 'PUT',
                    contentType: 'application/json',
                    data: JSON.stringify(data),
                    headers: {
                        'X-HTTP-Method-Override': 'PATCH',
                    },
                });
            },

            updateMultipleVsoWorkItem: function (data) {
                return this.vsoRequest('/_apis/wit/workItems', undefined, {
                    type: 'PUT',
                    contentType: 'application/json',
                    data: JSON.stringify(data),
                    headers: {
                        'X-HTTP-Method-Override': 'PATCH',
                    },
                });
            },

            createVsoSubscription: function (projId) {
                return this.vsoRequest('/_apis/hooks/subscriptions', undefined, {
                    type: 'POST',
                    contentType: 'application/json',
                    data: JSON.stringify({
                        "eventType": "workitem.commented",
                        "consumerId": "zendesk",
                        "consumerActionId": "createPrivateComment",
                        "publisherId": "tfs",
                        "publisherInputs": {
                            "commentPattern": VSO_TO_ZENDESK_COMMENT_BEGINS_WITH,
                            "projectId": projId,
                        },
                        "consumerInputs": {
                            "accountName": this.currentAccount().subdomain(),
                            "username": this.setting('zendesk_username'),
                            "apiToken": this.setting('zendesk_api_token')
                        }
                    })
                });
            }
        },

        onGetVsoUserProfileWithTwaDone: function (data) { this.vm.userProfile = data.identity; },

        onGetVsoProjectsWithTwaDone: function (projects) {
            this.vm.projects = _.map(projects.__wrappedArray, function (project) {
                return {
                    id: project.guid,
                    name: project.name,
                    workItemTypes: [],
                    processTemplateName: this.getProcessTemplateName(project)
                };
            }.bind(this));
        },

        onGetVsoFieldsWithTwaDone: function (data) {
            this.vm.fields = _.map(data.__wrappedArray, function (field) {
                return {
                    refName: field.referenceName,
                    name: field.name,
                    id: field.id
                };
            });
        },

        getLinkedVsoWorkItems: function (func) {
            var vsoLinkedIds = this.getLinkedWorkItemIds();

            var finish = function (workItems) {
                if (func && _.isFunction(func)) { func(workItems); } else { this.displayMain(); }
                this.onGetLinkedVsoWorkItemsDone(workItems);
            }.bind(this);

            if (!vsoLinkedIds || vsoLinkedIds.length === 0) {
                finish([]);
                return;
            }

            this.ajax('getVsoWorkItems', vsoLinkedIds.join(','))
                .done(function (data) { finish(data.value); })
                .fail(function (jqXHR) { this.displayMain(this.getAjaxErrorMessage(jqXHR)); }.bind(this));
        },

        onGetLinkedVsoWorkItemsDone: function (data) {
            this._vm.workItems = data;
            _.each(this._vm.workItems, function (workItem) {
                workItem.title = helpers.fmt("%@: %@", workItem.id, _.find(workItem.fields, function (f) { return f.field.refName == "System.Title"; }).value);
                helpers.fmt("https://%@.zendesk.com/agent/#/tickets/%@", this.currentAccount().subdomain(), this.ticket().id());
            }.bind(this));
            this.drawWorkItems();
        },

        //#endregion

        //#region Events Implementation

        // App
        onAppActivated: function (data) {

            if (data.firstLoad) {
                //Check if everything is ok to continue
                if (!(this.setting('vso_account'))) {
                    return this.switchTo('finish_setup');
                }

                if (!this.store("auth_token_for_" + this.setting('vso_account'))) {
                    return this.switchTo('login');
                }

                //Private instance view model 
                this._vm = { workItems: [] };

                if (!this.vm.isAppLoadedOk) {
                    //Initialize global data
                    this.vm.fieldSettings = JSON.parse(this.setting('vso_field_settings') || DEFAULT_FIELD_SETTINGS);
                    this.when(
                        this.ajax('getVsoProjectsWithTwa'),
                        this.ajax('getVsoFieldsWithTwa'),
                        this.ajax('getVsoUserProfileWithTwa')
                    ).done(function () {
                        this.vm.isAppLoadedOk = true;
                        this.getLinkedVsoWorkItems();
                    }.bind(this))
                    .fail(function (jqXHR, textStatus, err) {
                        this.switchTo('error_loading_app');
                    }.bind(this));
                } else {
                    this.getLinkedVsoWorkItems();
                }
            }
        },

        // UI
        onNewWorkItemClick: function () {

            var $modal = this.$('#newWorkItemModal').modal();
            $modal.find('.modal-body').html(this.renderTemplate('loading'));
            this.ajax('getComments').done(function (data) {
                var attachments = _.flatten(_.map(data.comments, function (comment) {
                    return comment.attachments || [];
                }), true);
                $modal.find('.modal-body').html(this.renderTemplate('new', { attachments: attachments }));
                $modal.find('#summary').val(this.ticket().subject());

                var projectCombo = $modal.find('#project');
                this.fillComboWithProjects(projectCombo);
                projectCombo.change();

            }.bind(this));
        },

        onNewVsoProjectChange: function (e, ui) {
            var $modal = this.$('#newWorkItemModal');
            var projId = $modal.find('#project').val();

            this.showSpinnerInModal($modal);

            this.loadProjectWorkItemTypes(projId)
            .done(function () {
                this.drawTypesList($modal.find('#type'), projId);
                $modal.find('#type').change();
                this.hideSpinnerInModal($modal);
            }.bind(this))
            .fail(function (jqXHR) {
                this.showErrorInModal($modal, this.getAjaxErrorMessage(jqXHR));
            }.bind(this));
        },

        onNewVsoWorkItemTypeChange: function (e, ui) {
            var $modal = this.$('#newWorkItemModal');
            var project = this.getProjectById($modal.find('#project').val());
            var workItemType = this.getWorkItemTypeById(project, $modal.find('#type').val());

            //Check if we have severity
            if (this.hasFieldDefined(workItemType, "Microsoft.VSTS.Common.Severity")) {
                $modal.find('.severityInput').show();
            } else {
                $modal.find('.severityInput').hide();
            }
        },

        onNewCopyDescriptionClick: function (event) {
            event.preventDefault();
            this.$('#newWorkItemModal #description').val(this.ticket().description());
        },

        onNewWorkItemAcceptClick: function () {
            var $modal = this.$('#newWorkItemModal').modal();

            //check project
            var proj = this.getProjectById($modal.find('#project').val());
            if (!proj) { return this.showErrorInModal($modal, this.I18n.t("modals.new.errProjRequired")); }

            //check work item type
            var workItemType = this.getWorkItemTypeById(proj, $modal.find('#type').val());
            if (!workItemType) { return this.showErrorInModal($modal, this.I18n.t("modals.new.errWorkItemTypeRequired")); }

            //check summary
            var summary = $modal.find("#summary").val();
            if (!summary) { return this.showErrorInModal($modal, this.I18n.t("modals.new.errSummaryRequired")); }

            var description = $modal.find("#description").val();

            var attachments = [];
            $modal.find('.attachments input').each(function () { if (this.checked) { attachments.push(this.value); } });

            //Required fields for all project/work item types
            var data = {
                fields: [
                    { field: { refName: "System.AreaPath" }, value: proj.name },
                    { field: { refName: "System.IterationPath" }, value: proj.name },
                    { field: { refName: "System.WorkItemType" }, value: workItemType.name },
                    { field: { refName: "System.Title" }, value: summary },
                    { field: { refName: "System.Description" }, value: description },
                ]
            };

            if (this.hasFieldDefined(workItemType, "Microsoft.VSTS.Common.Severity") && $modal.find('#severity').val()) {
                data.fields.push({ field: { refName: "Microsoft.VSTS.Common.Severity" }, value: $modal.find('#severity').val() });
            }

            if (this.hasFieldDefined(workItemType, "Microsoft.VSTS.TCM.ReproSteps")) {
                data.fields.push({ field: { refName: "Microsoft.VSTS.TCM.ReproSteps" }, value: description });
            }

            if (this.setting("vso_tag")) {
                data.fields.push({ field: { refName: "System.Tags" }, value: this.setting("vso_tag") });
            }

            //Concat configured fields for work item type
            data.fields = data.fields.concat(this.getAutomaticFields(proj.processTemplateName, workItemType));

            //Add Links
            data.resourceLinks = [
                {
                    type: "hyperlink",
                    location: this.buildTicketLinkUrl(),
                    name: VSO_ZENDESK_LINK_TO_TICKET_PREFIX + this.ticket().id()
                }
            ].concat(
                _.map(attachments, function (att) {
                    return {
                        type: "hyperlink",
                        location: att,
                        name: VSO_ZENDESK_LINK_TO_TICKET_ATTACHMENT_PREFIX + this.ticket().id()
                    };
                }.bind(this)));

            this.showSpinnerInModal($modal);

            this.ajax('createVsoWorkItem', data)
                .done(function (data) {
                    var newWorkItemId = data.id;
                    //sanity check due tfs returning 200 ok  but with exception
                    if (newWorkItemId > 0) { this.linkTicket(newWorkItemId); }

                    services.notify(this.I18n.t('notify.workItemCreated').fmt(newWorkItemId));
                    this.getLinkedVsoWorkItems(function () { this.closeModal($modal); }.bind(this));
                }.bind(this))
                .fail(function (jqXHR) {
                    this.showErrorInModal($modal, this.getAjaxErrorMessage(jqXHR));
                }.bind(this));
        },

        onCogClick: function () {
            this.switchTo('admin');
            this.drawSettings();
        },

        onCloseAdminClick: function () {
            this.displayMain();
        },

        onSettingChange: function () {
            var self = this;
            var fieldSettings = {};
            this.$('tr').each(function () {
                var line = self.$(this);
                fieldSettings[line.attr('data-refName')] = {
                    summary: line.find('.summary').is(':checked'),
                    details: line.find('.details').is(':checked')
                };
            });
            this.vm.fieldSettings = fieldSettings;
            this.ajax('saveSettings', { vso_field_settings: JSON.stringify(fieldSettings) })
                .done(function () {
                    services.notify(this.I18n.t('admin.settingsSaved'));
                }.bind(this));
        },

        onShowDetailsClick: function (event) {
            var $modal = this.$('#detailsModal').modal();
            $modal.find('.modal-header h3').html(this.I18n.t('modals.details.loading'));
            $modal.find('.modal-body').html(this.renderTemplate('loading'));
            var id = this.$(event.target).closest('.workItem').attr('data-id');
            var workItem = this.getWorkItemById(id);
            workItem = this.attachRestrictedFieldsToWorkItem(workItem, 'details');
            $modal.find('.modal-header h3').html(this.I18n.t('modals.details.title', { name: workItem.title }));
            $modal.find('.modal-body').html(this.renderTemplate('details', workItem));
        },

        onLinkClick: function (event) {
            var $modal = this.$('#linkModal').modal();
            $modal.find('.modal-footer button').removeAttr('disabled');
            $modal.find('.modal-body').html(this.renderTemplate('link'));
            $modal.find("button.search").show();

            var projectCombo = $modal.find('#project');
            this.fillComboWithProjects(projectCombo);
            projectCombo.change();
        },

        onLinkSearchClick: function (event) {
            var $modal = this.$('#linkModal');
            $modal.find(".search-section").show();
        },

        onLinkResultClick: function (event) {
            event.preventDefault();
            var $modal = this.$('#linkModal');
            var id = this.$(event.target).closest('.workItemResult').attr('data-id');
            $modal.find('#inputVsoWorkItemId').val(id);
            $modal.find('.search-section').hide();
        },

        onLinkVsoProjectChange: function (e, ui) {
            var $modal = this.$('#linkModal');
            var projId = $modal.find('#project').val();

            this.showSpinnerInModal($modal);

            this.loadProjectWorkItemQueries(projId)
            .done(function () {
                this.drawQueriesList($modal.find('#query'), projId);
                this.hideSpinnerInModal($modal);
            }.bind(this))
            .fail(function (jqXHR) {
                this.showErrorInModal($modal, this.getAjaxErrorMessage(jqXHR));
            }.bind(this));
        },

        onLinkQueryButtonClick: function () {
            var $modal = this.$('#linkModal');
            var projId = $modal.find('#project').val();
            var queryId = $modal.find('#query').val();

            var _drawQueryResults = function (results, countQueryItemsResult) {
                var workItems = _.map(results, function (workItem) {
                    return {
                        id: workItem.id,
                        type: this.getWorkItemFieldValue(workItem, "System.WorkItemType"),
                        title: this.getWorkItemFieldValue(workItem, "System.Title")
                    };
                }.bind(this));

                $modal.find('.results').html(this.renderTemplate('query_results', { workItems: workItems }));
                $modal.find('.alert-success').html(this.I18n.t('queryResults.returnedWorkItems', { count: countQueryItemsResult }));
                this.hideSpinnerInModal($modal);

            }.bind(this);

            this.showSpinnerInModal($modal);
            this.ajax('getVsoWorkItemQueryResult', queryId)
                .done(function (data) {

                    if (data.results.length === 0) {
                        return _drawQueryResults([], 0);
                    }

                    var ids = _.pluck(_.first(data.results, 200), "sourceId").join(',');
                    this.ajax('getVsoWorkItems', ids).done(function (results) {
                        _drawQueryResults(results.value, data.results.length);
                    });
                }.bind(this))
                .fail(function (jqXHR, textStatus, errorThrown) {
                    this.showErrorInModal($modal, this.getAjaxErrorMessage(jqXHR, this.I18n.t('modals.link.errCannotGetWorkItem')));
                }.bind(this));

        },

        onLinkAcceptClick: function (event) {
            var $modal = this.$('#linkModal');
            var workItemId = $modal.find('#inputVsoWorkItemId').val();

            if (!/^([0-9]+)$/.test(workItemId)) {
                return this.showErrorInModal($modal, this.I18n.t('modals.link.errWorkItemIdNaN'));
            }

            if (this.isAlreadyLinkedToWorkItem(workItemId)) {
                return this.showErrorInModal($modal, this.I18n.t('modals.link.errAlreadyLinked'));
            }

            this.showSpinnerInModal($modal);
            var _updateWorkItem = function (workItem) {

                //Let's check if there is already a link in the WI returned data
                var currentLink = _.find(workItem.resourceLinks || [], function (link) {
                    if (link.type === "hyperlink" && link.name === (VSO_ZENDESK_LINK_TO_TICKET_PREFIX + this.ticket().id())) {
                        return link;
                    }
                }.bind(this));

                var _finish = function () {
                    this.linkTicket(workItemId);
                    services.notify(this.I18n.t('notify.workItemLinked').fmt(workItemId));
                    this.getLinkedVsoWorkItems(function () { this.closeModal($modal); }.bind(this));
                }.bind(this);

                if (currentLink) {
                    _finish();
                } else {

                    var data = {
                        id: workItemId,
                        rev: workItem.rev,
                        resourceLinks: [{
                            type: "hyperlink",
                            location: this.buildTicketLinkUrl(),
                            comment: "",
                            name: VSO_ZENDESK_LINK_TO_TICKET_PREFIX + this.ticket().id()
                        }]
                    };

                    this.ajax('updateVsoWorkItem', workItemId, data)
                        .done(function () {
                            _finish();
                        }.bind(this))
                        .fail(function (jqXHR) {
                            this.showErrorInModal($modal, this.getAjaxErrorMessage(jqXHR, this.I18n.t('modals.link.errCannotUpdateWorkItem')));
                        }.bind(this));
                }
            }.bind(this);

            //Get work item and then update
            this.ajax('getVsoWorkItem', workItemId)
                .done(function (data) {
                    _updateWorkItem(data);
                }.bind(this))
                .fail(function (jqXHR) {
                    this.showErrorInModal($modal, this.getAjaxErrorMessage(jqXHR, this.I18n.t('modals.link.errCannotGetWorkItem')));
                }.bind(this));
        },

        onUnlinkClick: function (event) {
            var id = this.$(event.target).closest('.workItem').attr('data-id');
            var workItem = this.getWorkItemById(id);
            var $modal = this.$('#unlinkModal').modal();
            $modal.find('.modal-body').html(this.renderTemplate('unlink'));
            $modal.find('.modal-footer button').removeAttr('disabled');
            $modal.find('.modal-body .confirm').html(this.I18n.t('modals.unlink.text', { name: workItem.title }));
            $modal.attr('data-id', id);
        },

        onUnlinkAcceptClick: function (event) {
            event.preventDefault();
            var $modal = this.$(event.target).closest('#unlinkModal');

            this.showSpinnerInModal($modal);
            var workItemId = $modal.attr('data-id');

            var _updateWorkItem = function (workItem) {

                //Let's get the set of links related to this workitem
                var linksToRemove = _.filter(workItem.resourceLinks, function (link) {
                    return link.type === 'hyperlink' &&
                        (link.name === VSO_ZENDESK_LINK_TO_TICKET_PREFIX + this.ticket().id() ||
                        link.name === VSO_ZENDESK_LINK_TO_TICKET_ATTACHMENT_PREFIX + this.ticket().id());
                }.bind(this));

                var _finish = function () {
                    this.unlinkTicket(workItem.id);
                    services.notify(this.I18n.t('notify.workItemUnlinked').fmt(workItem.id));
                    this.getLinkedVsoWorkItems(function () { this.closeModal($modal); }.bind(this));
                }.bind(this);

                if (linksToRemove.length === 0) {
                    _finish();
                } else {
                    var data = {
                        id: workItemId,
                        rev: workItem.rev,
                        resourceLinks: _.map(linksToRemove, function (link) { return _.extend(link, { "updateType": "delete" }); })
                    };

                    this.ajax('updateVsoWorkItem', workItemId, data)
                        .done(function () { _finish(); })
                        .fail(function (jqXHR) {
                            this.showErrorInModal($modal, this.getAjaxErrorMessage(jqXHR, this.I18n.t('modals.unlink.errUnlink')));
                        }.bind(this));
                }
            }.bind(this);

            //Get work item to get the last revision and then update
            this.ajax('getVsoWorkItem', workItemId)
                .done(function (workItem) { _updateWorkItem(workItem); }.bind(this))
                .fail(function (jqXHR) { this.showErrorInModal($modal, this.getAjaxErrorMessage(jqXHR)); }.bind(this));
        },

        onNotifyClick: function () {
            var $modal = this.$('#notifyModal');
            $modal.find('.modal-body').html(this.renderTemplate('loading'));
            $modal.modal();

            this.ajax('getComments').done(function (data) {
                this.lastComment = data.comments[data.comments.length - 1].body;
                var attachments = _.flatten(_.map(data.comments, function (comment) {
                    return comment.attachments || [];
                }), true);
                $modal.find('.modal-body').html(this.renderTemplate('notify', { attachments: attachments }));
                $modal.find('.modal-footer button').prop('disabled', false);
            }.bind(this));
        },

        onNotifyAcceptClick: function () {
            var $modal = this.$('#notifyModal');
            var text = $modal.find('textarea').val();

            if (!text) { return this.showErrorInModal($modal, this.I18n.t("modals.notify.errCommentRequired")); }

            $modal.find('.attachments input').each(function () {
                if (this.checked) { text += "\r\n[%@]".fmt(this.value); }
            });

            var name = this.currentUser().name();
            var msg = [this.I18n.t('notify.message', { name: name }), text].join("\n\r\n\r");

            this.showSpinnerInModal($modal);

            //Refresh linked VSO work items
            this.getLinkedVsoWorkItems(function (workItems) {

                var updatePayload = _.map(workItems, function (workItem) {
                    return {
                        id: workItem.id,
                        rev: workItem.rev,
                        fields: [{ field: { refName: 'System.History' }, value: text }]
                    };
                }.bind(this));

                this.ajax('updateMultipleVsoWorkItem', updatePayload)
                .done(function () {
                    var ticketMsg = [this.I18n.t('notify.message', { name: name }), text].join("\n\r\n\r");
                    this.ajax('addPrivateCommentToTicket', ticketMsg);
                    services.notify(this.I18n.t('notify.notification'));
                    this.closeModal($modal);
                }.bind(this))
                .fail(function (jqXHR) {
                    this.showErrorInModal($modal, this.getAjaxErrorMessage(jqXHR));
                }.bind(this));
            }.bind(this));
        },

        onCopyLastCommentClick: function (event) {
            event.preventDefault();
            this.$('#notifyModal').find('textarea').val(this.lastComment);
        },

        onRefreshWorkItemClick: function (event) {
            event.preventDefault();
            this.$('workItemsError').hide();
            this.switchTo('loading');
            this.getLinkedVsoWorkItems();
        },

        onLoginClick: function (event) {
            event.preventDefault();
            var vso_username = this.$('#vso_username').val();
            var vso_password = this.$('#vso_password').val();

            if (!vso_username || !vso_password) {
                this.$(".login-form").find('.errors').text(this.I18n.t("login.errRequiredFields")).show();
                return;
            }

            this.authString(vso_username, vso_password);
            services.notify("Visual Studio Online alternate credentials stored with success.");

            this.switchTo('loading');
            if (!this.vm.isAppLoadedOk) {
                this.onAppActivated({ firstLoad: true });
            } else {
                this.getLinkedVsoWorkItems();
            }
        },

        onCloseLoginClick: function () {
            this.displayMain();
        },

        onUserIconClick: function () {
            this.switchTo('login');
        },

        //#endregion

        //#region Drawing

        displayMain: function (err) {
            if (this.vm.isAppLoadedOk) {
                this.$('.cog').toggle(this.isAdmin());
                this.switchTo('main');
                if (!err) {
                    this.drawWorkItems();
                } else {
                    this.$('#workItemsError').show();
                }
            } else {
                this.$('.cog').toggle(false);
                this.switchTo('error_loading_app');
            }
        },

        drawWorkItems: function (data) {

            var workItems = _.map(data || this._vm.workItems, function (workItem) {
                var tmp = this.attachRestrictedFieldsToWorkItem(workItem, 'summary');
                return tmp;
            }.bind(this));

            this.$('.workItems').html(this.renderTemplate('workItems', { workItems: workItems }));
            this.$('.buttons .notify').prop('disabled', !workItems.length);
        },

        drawTypesList: function (select, projectId) {
            var project = this.getProjectById(projectId);
            select.html(this.renderTemplate('types', { types: project.workItemTypes }));
        },

        drawQueriesList: function (select, projectId) {
            var project = this.getProjectById(projectId);

            var _drawNode = function (node, prefix) {
                if (node.type == "query") {
                    return "<option value='%@'>%@ %@</option>".fmt(node.id, prefix, node.name);
                }

                //it's a folder
                if (node.type == "folder") {
                    return "<optgroup label='%@ %@'>%@</optgroup>".fmt(
                       prefix,
                        node.name,
                        _.reduce(node.value, function (options, childNode, ix) {
                            return "%@%@".fmt(options, _drawNode(childNode, prefix + (ix + 1) + "."));
                        }, ""));
                }
            }.bind(this);

            select.html(_.reduce(project.queries, function (options, query, ix) {
                return "%@%@".fmt(options, _drawNode(query, "" + (ix + 1) + "."));
            }, ""));

        },

        drawSettings: function () {
            var settings = _.sortBy(
                _.map(this.vm.fields, function (field) {
                    var current = this.vm.fieldSettings[field.refName];
                    if (current) { field = _.extend(field, current); }
                    return field;
                }.bind(this)), function (f) { return f.name; });

            var html = this.renderTemplate('settings', { settings: settings });
            this.$('.content').html(html);
        },

        showSpinnerInModal: function ($modal) {
            if ($modal.find('.modal-body form')) { $modal.find('.modal-body form').hide(); }
            if ($modal.find('.modal-body .loading')) { $modal.find('.modal-body .loading').show(); }
            if ($modal.find('.modal-footer button')) { $modal.find('.modal-footer button').attr('disabled', 'disabled'); }
        },

        hideSpinnerInModal: function ($modal) {
            if ($modal.find('.modal-body form')) { $modal.find('.modal-body form').show(); }
            if ($modal.find('.modal-body .loading')) { $modal.find('.modal-body .loading').hide(); }
            if ($modal.find('.modal-footer button')) { $modal.find('.modal-footer button').prop('disabled', false); }
        },

        showErrorInModal: function ($modal, err) {
            this.hideSpinnerInModal($modal);
            if ($modal.find('.modal-body .errors')) { $modal.find('.modal-body .errors').text(err).show(); }
        },

        closeModal: function ($modal) {
            $modal.find('#loading').hide();
            $modal.modal('hide').find('.modal-footer button').attr('disabled', '');
        },

        fillComboWithProjects: function (el) {

            el.html(_.reduce(this.vm.projects, function (options, project) {
                return "%@<option value='%@'>%@</option>".fmt(options, project.id, project.name);
            }, ""));
        },

        //#endregion

        //#region Helpers

        isAdmin: function () {
            return this.currentUser().role() === 'admin';
        },

        vsoUrl: function (url, parameters) {
            var setting = this.setting('vso_account');
            var baseUrl = helpers.fmt(VSO_URL_FORMAT, setting);
            var loweredSetting = setting.toLowerCase();

            if (loweredSetting.indexOf('http://') === 0 || loweredSetting.indexOf('https://') === 0) {
                baseUrl = setting;
            }

            baseUrl = (baseUrl[baseUrl.length - 1] === '/') ? baseUrl.slice(0, -1) : baseUrl;
            url = (url[0] === '/') ? url.slice(1) : url;
            var full = [baseUrl, url].join('/');
            if (parameters) {
                full += '?' + _.map(parameters, function (value, key) {
                    return [key, value].join('=');
                }).join('&');
            }
            return full;
        },

        authString: function (vso_username, vso_password) {

            if (vso_username && vso_password) {
                var b64 = Base64.encode([vso_username, vso_password].join(':'));
                this.store('auth_token_for_' + this.setting('vso_account'), b64);
            }

            return helpers.fmt("Basic %@", this.store('auth_token_for_' + this.setting('vso_account')));
        },

        vsoRequest: function (url, parameters, options) {
            var requestOptions = _.extend({
                url: this.vsoUrl(url, parameters),
                dataType: 'json',
            }, options);

            requestOptions.headers = _.extend({ 'Authorization': this.authString() }, options ? options.headers : {});
            return requestOptions;
        },

        attachRestrictedFieldsToWorkItem: function (workItem, type) {
            var fields = _.compact(_.map(this.vm.fieldSettings, function (value, key) {
                if (value[type]) {
                    var workItemField = _.find(workItem.fields, function (f) { return f.field.refName == key; });

                    if (workItemField) {
                        return {
                            refName: key,
                            name: _.find(this.vm.fields, function (f) { return f.refName == key; }).name,
                            value: workItemField.value
                        };
                    }
                }
            }.bind(this)));
            return _.extend(workItem, { restricted_fields: fields });
        },

        getWorkItemById: function (id) {
            return _.find(this._vm.workItems, function (workItem) { return workItem.id == id; });
        },

        getProjectById: function (id) {
            return _.find(this.vm.projects, function (proj) { return proj.id == id; });
        },

        getWorkItemTypeById: function (project, id) {
            return _.find(project.workItemTypes, function (wit) { return wit.id == id; });
        },

        getFieldByFieldRefName: function (fieldRefName) {
            return _.find(this.vm.fields, function (f) { return f.refName == fieldRefName; });
        },

        getWorkItemFieldValue: function (workItem, fieldRefName) {
            var field = _.find(workItem.fields, function (f) { return f.field.refName == fieldRefName; });

            return field ? field.value : "";
        },

        hasFieldDefined: function (workItemType, fieldRefName) {
            var field = this.getFieldByFieldRefName(fieldRefName);
            return _.contains(workItemType.fields, field.id);
        },

        linkTicket: function (workItemId) {
            var linkVsoTag = TAG_PREFIX + workItemId;
            this.ticket().tags().add(linkVsoTag);

            this.ajax('addTagToTicket', linkVsoTag);
        },

        unlinkTicket: function (workItemId) {
            var linkVsoTag = TAG_PREFIX + workItemId;
            this.ticket().tags().remove(linkVsoTag);

            this.ajax('removeTagFromTicket', linkVsoTag);
        },

        buildTicketLinkUrl: function () {
            return helpers.fmt("https://%@.zendesk.com/agent/#/tickets/%@", this.currentAccount().subdomain(), this.ticket().id());
        },

        getLinkedWorkItemIds: function () {
            return _.compact(this.ticket().tags().map(function (t) {
                var p = t.indexOf(TAG_PREFIX);
                if (p === 0) { return t.slice(TAG_PREFIX.length); }
            }));
        },

        isAlreadyLinkedToWorkItem: function (id) { return _.contains(this.getLinkedWorkItemIds(), id); },

        loadProjectWorkItemTypes: function (projectId) {
            var project = this.getProjectById(projectId);
            if (project.metadataLoaded === true) { return this.promise(function (done) { done(); }); }

            //Let's load project metdata
            return this.ajax('getVsoProjectWorkItemTypes', project.name).done(function (data) {
                project.workItemTypes = this.restrictToAllowedWorkItems(data.__wrappedArray);
                project.metadataLoaded = true;
            }.bind(this));
        },

        loadProjectWorkItemQueries: function (projectId) {
            var project = this.getProjectById(projectId);
            if (project.queries) { return this.promise(function (done) { done(); }); }

            //Let's load project queries
            return this.ajax('getVsoProjectWorkItemQueries', project.name).done(function (data) {
                project.queries = data.value;
            }.bind(this));
        },

        restrictToAllowedWorkItems: function (wits) {
            return _.filter(wits, function (wit) { return _.contains(VSO_WI_TYPES_WHITE_LISTS, wit.name); });
        },

        getAutomaticFields: function (processTemplateName, workItemType) {

            var autoFields = [];
            _.each(VSO_WI_TYPES_INCLUDE_FIELDS[processTemplateName][workItemType.name] || [], function (field) {

                var refName = field.field.refName;
                if (this.hasFieldDefined(workItemType, refName)) {
                    var addField = { field: { refName: refName }, value: field.value };

                    if (field.valueReader) {
                        addField.value = this.workItemFieldValueReaders[field.valueReader].call(this);
                    }

                    autoFields.push(addField);
                }
            }.bind(this));

            return autoFields;
        },

        getAjaxErrorMessage: function (jqXHR, errMsg) {
            errMsg = errMsg || this.I18n.t("errorAjax");

            //Let's try get a friendly message based on some cases
            var serverErrMsg;
            if (jqXHR.responseJSON) {
                serverErrMsg = jqXHR.responseJSON.message || jqXHR.responseJSON.value.Message;
            } else {
                serverErrMsg = jqXHR.responseText.substring(0, 50) + "...";
            }

            var detail = this.I18n.t("errorServer").fmt(jqXHR.status, jqXHR.statusText, serverErrMsg);
            return errMsg + " " + detail;
        },

        getProcessTemplateName: function (project) {

            if (_.contains(project.workItemTypes, "Product Backlog Item")) {
                return "SCRUM";
            } else if (_.contains(project.workItemTypes, "Change Request")) {
                return "CMMI";
            } else if (_.contains(project.workItemTypes, "User Story")) {
                return "MSF";
            } else {
                throw "Process template not supported!";
            }
        },

        //#endregion
    };
}(this));