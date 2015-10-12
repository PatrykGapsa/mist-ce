define('app/views/graph_list_item', ['d3', 'c3'],
    //
    //  Graph View
    //
    //  @returns Class
    //
    function (d3, c3) {

        'use strict';

        return App.GraphListItemComponent = Ember.Component.extend({

            //
            //  Properties
            //

            layoutName: 'graph_list_item',
            graph: null,
            unit: null,
            isHidden: null,
            actionProxy: null,


            //
            //  Initialization
            //

            load: function () {
                Ember.run.next(this, function () {
                    this.graph.set('view', this);
                });
            }.on('didInsertElement'),

            unload: function () {
                var charts = this.get('charts') || [];
                charts.forEach(function(chart) { chart.destroy(); });
                Ember.run.next(this, function () {
                    if (this.graph)
                        this.graph.set('view', null);
                });
            }.on('willDestroyElement'),


            //
            //  Methods
            //

            draw: function (reload) {
                var that = this,
                    graph = this.graph,
                    charts = this.get('charts') || [];

                if (reload) {
                    info('reloading charts');
                    // destroy old charts
                    charts.forEach(function(chart){chart.destroy()});
                    charts = [];
                }

                if (!graph.datasources || !graph.datasources.length)
                    return;

                var source0 = graph.datasources[0],
                    maxpoints = 0;

                // Get the source with the max no of datapoints
                for (var i=0; i < graph.datasources.length; i++)
                    if (graph.datasources[i].datapoints.length > maxpoints)
                        source0 = graph.datasources[i];

                var unit = source0.metric.unit,
                    lastpoint = source0.datapoints[source0.datapoints.length-1];

                // prepare x axis column
                var x = source0.datapoints.map(
                    function(point) { return point.time }
                );

                if (x[0] != 'x') {
                    x = ['x'].pushObjects(x);
                }

                var tickFormat = '%b %Y', timedelta = x[x.length-1]-x[1];

                if (timedelta < 85000000)
                    tickFormat = "%H:%M";
                else if (timedelta < 2549000000)
                    tickFormat = "%d %b"

                graph.get('batches').forEach(function(batch, batchNo) {
                    // prepare other columns
                    var cols = [x].pushObjects(batch.body.map(
                        function (datasource) {
                            var ret = datasource.datapoints.map(function (datapoint) {
                                return datapoint.value;
                            });
                            if (graph.multi)
                                ret.unshift(datasource.machine.name)
                            else
                                ret.unshift(datasource.metric.id);

                            return ret;
                        }
                    ));

                    var chartType = 'area-spline';

                    if (graph.multi)
                        chartType = 'spline';

                    if (Mist.graphsController.stream.isStreaming && charts.length > batchNo && !reload) { // stream new datapoints in existing chart
                        // Only add values that are not already in the chart
                        var lastx = null, maxLength=0;
                        try{ // maybe there are no datapoints shown on the chart
                            var shown = charts[batchNo].data(), jmax=0;
                            for (var j=0; j < shown.length; j++) {
                                if (shown[j].values.length > maxLength){
                                    jmax = j;
                                    maxLength = shown[j].values.length;
                                }
                            }
                            lastx = charts[batchNo].data.shown()[jmax].values.slice(-1)[0].x;
                        } catch(e) {}

                        // if chart emty and data or if data in chart older than this batch then load all columns
                        if (!lastx || (cols[0].length > 1 && lastx < cols[0][1])) {
                            for (var z=0;z<cols.length; z++) {
                                if (cols[z].length>1){
                                    charts[batchNo].flow({
                                        columns: cols
                                    });
                                    break;
                                }
                            }
                        } else { // else stream only those that are not shown
                            for (var i=0; i < x.length; i++) {
                                if (lastx && x[x.length-1-i]<=lastx)
                                    break
                            }
                            if (i > 1){
                                var newcols = []
                                cols.forEach(function(col) {
                                    newcols.push([col[0]].pushObjects(col.slice(0-i)))
                                });
                            }
                            if (maxLength < MAX_DATAPOINTS ) {
                                i = 0; // Do not flow if not enough datapoints in chart
                            }
                            try {
                                charts[batchNo].flow({
                                    duration: 250,
                                    length: i,
                                    columns: newcols
                                });
                            } catch(e) {
                                error(e);
                            }
                        }
                    } else { // generate new chart
                        charts.push(c3.generate({
                            bindto: '#' + batch.id,
                            padding: {
                                right: 20
                            },
                            data: {
                                x: 'x',
                                columns: cols,
                                type: chartType,
                            },
                            axis: {
                                x: {
                                    type: 'timeseries',
                                    tick: {
                                        format: tickFormat,
                                        fit: false
                                    },
                                    padding: {
                                        left: 0,
                                        right: 0
                                    }
                                },
                                y: {
                                    label: {
                                        text: unit,
                                        position: 'inner-top'
                                    },
                                    tick: {
                                        format: function(val) {
                                            return graph.valueText(val)
                                        }
                                    },
                                    min: 0,
                                    padding: {
                                        bottom: 10
                                    }
                                }
                            },
                            point: {
                                r: 0,
                                focus: {
                                    expand: {
                                        r: 3
                                    }
                                }
                            },
                            line: {
                                connectNull: false
                            },
                            tooltip: {
                                format: {
                                    title: function(x) { return x.toLocaleString(); },
                                    value: function (value, ratio, id, index) {
                                        return graph.valueText(value) + unit;
                                    }
                                }
                            },
                            color: {
                                pattern: ['#0099CC', '#8c76d1', '#D46355', '#FFC65D', '#64B247', '#FF1B00', '#000000', '#C87600']
                            }
                        }));
                        that.set('charts', charts);
                    }
                });
            },

            clearData: function () {
                this.graph.datasources.forEach(function (datasource) {
                    datasource.clear();
                });
            },

            enableAnimation: function () {
                this.set('animationEnabled', true);
            },


            //
            //  Observers
            //

            isVisibleObserver: function () {
                var isHidden = this.isHidden,
                id = '#' + this.graph.id + '-0';
                if (isHidden) {
                    warn('real id', this.graph.id + '-0');
                    warn('hiding', this.graph.id);
                    $(id).parent().hide();
                } else if (isHidden !== undefined) {
                    $(id).parent().show();
                    this.draw();
                }
            }.observes('isHidden'),

            isEmptyObserver: function () {
                if (this.graph.isEmpty)
                    $('#' + this.id).parent().hide(500);
                else
                    $('#' + this.id).parent().show(500);
            }.observes('graph.isEmpty')
        });
    }
);
