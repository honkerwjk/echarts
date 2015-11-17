/**
 * @module echarts/component/helper/MapDraw
 */
define(function (require) {

    var RoamController = require('./RoamController');
    var graphic = require('../../util/graphic');
    var zrUtil = require('zrender/core/util');

    function getFixedItemStyle(model, scale) {
        var itemStyle = model.getItemStyle();
        var areaColor = model.get('areaColor');
        if (areaColor) {
            itemStyle.fill = areaColor;
        }
        itemStyle.lineWidth && (itemStyle.lineWidth /= scale[0]);

        return itemStyle;
    }

    function updateMapSelectHandler(mapOrGeoModel, data, group) {
        group.off('click');
        mapOrGeoModel.get('selectedMode')
            && group.on('click', function (e) {
                var dataIndex = e.target.dataIndex;
                if (dataIndex != null) {
                    var name = data.getName(dataIndex);
                    mapOrGeoModel.toggleSelected(name);

                    updateMapSelected(mapOrGeoModel, data);
                }
            });
    }

    function updateMapSelected(mapOrGeoModel, data) {
        data.eachItemGraphicEl(function (el, idx) {
            var name = data.getName(idx);
            el.trigger(mapOrGeoModel.isSelected(name) ? 'emphasis' : 'normal');
        });
    }

    /**
     * @alias module:echarts/component/helper/MapDraw
     * @param {module:echarts/ExtensionAPI} api
     * @param {boolean} updateGroup
     */
    function MapDraw(api, updateGroup) {

        var group = new graphic.Group();

        /**
         * @type {module:echarts/component/helper/RoamController}
         * @private
         */
        this._controller = new RoamController(
            api.getZr(), updateGroup ? group : null, null
        );

        /**
         * @type {module:zrender/container/Group}
         * @readOnly
         */
        this.group = group;

        /**
         * @type {boolean}
         * @private
         */
        this._updateGroup = updateGroup;
    }

    MapDraw.prototype = {

        constructor: MapDraw,

        draw: function (mapOrGeoModel, ecModel, api) {

            // geoModel has no data
            var data = mapOrGeoModel.getData && mapOrGeoModel.getData();

            var geo = mapOrGeoModel.coordinateSystem;

            var group = this.group;
            group.removeAll();

            var scale = geo.scale;
            group.position = geo.position.slice();
            group.scale = scale.slice();

            var itemStyleModel;
            var hoverItemStyleModel;
            var itemStyle;
            var hoverItemStyle;

            var labelModel;
            var hoverLabelModel;

            var itemStyleAccessPath = ['itemStyle', 'normal'];
            var hoverItemStyleAccessPath = ['itemStyle', 'emphasis'];
            var labelAccessPath = ['label', 'normal'];
            var hoverLabelAccessPath = ['label', 'emphasis'];
            if (!data) {
                itemStyleModel = mapOrGeoModel.getModel(itemStyleAccessPath);
                hoverItemStyleModel = mapOrGeoModel.getModel(hoverItemStyleAccessPath);

                itemStyle = getFixedItemStyle(itemStyleModel, scale);
                hoverItemStyle = getFixedItemStyle(hoverItemStyleModel, scale);

                labelModel = mapOrGeoModel.getModel(labelAccessPath);
                hoverLabelModel = mapOrGeoModel.getModel(hoverLabelAccessPath);
            }

            zrUtil.each(geo.regions, function (region) {

                var regionGroup = new graphic.Group();
                var dataIdx;
                // Use the itemStyle in data if has data
                if (data) {
                    dataIdx = data.indexOfName(region.name);
                    var itemModel = data.getItemModel(dataIdx);

                    // Only visual color of each item will be used. It can be encoded by dataRange
                    // But visual color of series is used in symbol drawing
                    var visualColor = data.getItemVisual(dataIdx, 'color', true);

                    itemStyleModel = itemModel.getModel(itemStyleAccessPath);
                    hoverItemStyleModel = itemModel.getModel(hoverItemStyleAccessPath);

                    itemStyle = getFixedItemStyle(itemStyleModel, scale);
                    hoverItemStyle = getFixedItemStyle(hoverItemStyleModel, scale);

                    labelModel = itemModel.getModel(labelAccessPath);
                    hoverLabelModel = itemModel.getModel(hoverLabelAccessPath);

                    if (visualColor) {
                        itemStyle.fill = visualColor;
                    }
                }
                var textStyleModel = labelModel.getModel('textStyle');
                var hoverTextStyleModel = hoverLabelModel.getModel('textStyle');

                zrUtil.each(region.contours, function (contour) {

                    var polygon = new graphic.Polygon({
                        shape: {
                            points: contour
                        }
                    });

                    polygon.setStyle(itemStyle);

                    regionGroup.add(polygon);
                });

                // Label
                var showLabel = labelModel.get('show');
                var hoverShowLabel = hoverLabelModel.get('show');

                var isDataNaN = data && isNaN(data.get('value', dataIdx));
                var itemLayout = data && data.getItemLayout(dataIdx);
                // In the following cases label will be drawn
                // 1. In map series and data value is NaN
                // 2. In component series
                // 3. Data value is not NaN and label only shows on hover
                // 4. Region has no series legendSymbol, which will be add a showLabel flag in mapSymbolLayout
                if (
                    (!data || isDataNaN && (showLabel || hoverShowLabel))
                 || (data && !isDataNaN && (!showLabel && hoverShowLabel))
                 || (itemLayout && itemLayout.showLabel)
                 ) {
                    var text = new graphic.Text({
                        style: {
                            text: region.name,
                            fill: textStyleModel.get('color'),
                            textFont: textStyleModel.getFont(),
                            textAlign: 'center',
                            textBaseline: 'middle'
                        },
                        hoverStyle: {
                            fill: hoverTextStyleModel.get('color'),
                            textFont: hoverTextStyleModel.getFont()
                        },
                        position: region.center.slice(),
                        scale: [1 / scale[0], 1 / scale[1]],
                        z2: 10,
                        silent: true
                    });
                    var emphasisLabel = function() {
                        text.attr('ignore', !hoverShowLabel);
                    };
                    var normalLabel = function() {
                        text.attr('ignore', !showLabel);
                    };
                    regionGroup.on('mouseover', emphasisLabel)
                        .on('mouseout', normalLabel)
                        .on('emphasis', emphasisLabel)
                        .on('normal', normalLabel);
                    text.ignore = !showLabel;

                    regionGroup.add(text);
                }

                // setItemGraphicEl, setHoverStyle after all polygons and labels
                // are added to the rigionGroup
                data && data.setItemGraphicEl(dataIdx, regionGroup);

                graphic.setHoverStyle(regionGroup, hoverItemStyle);

                group.add(regionGroup);
            });

            this._updateController(mapOrGeoModel, ecModel, api);

            data && updateMapSelectHandler(mapOrGeoModel, data, group);

            data && updateMapSelected(mapOrGeoModel, data);
        },

        remove: function () {
            this.group.removeAll();
            this._controller.dispose();
        },

        _updateController: function (mapOrGeoModel, ecModel, api) {
            var geo = mapOrGeoModel.coordinateSystem;
            var controller = this._controller;
            // roamType is will be set default true if it is null
            controller.enable(mapOrGeoModel.get('roam') || false);
            // FIXME mainType, subType 作为 component 的属性？
            var mainType = mapOrGeoModel.type.split('.')[0];
            controller.off('pan')
                .on('pan', function (dx, dy) {
                    api.dispatch({
                        type: 'geoRoam',
                        component: mainType,
                        name: mapOrGeoModel.name,
                        dx: dx,
                        dy: dy
                    });
                });
            controller.off('zoom')
                .on('zoom', function (zoom, mouseX, mouseY) {
                    api.dispatch({
                        type: 'geoRoam',
                        component: mainType,
                        name: mapOrGeoModel.name,
                        zoom: zoom,
                        originX: mouseX,
                        originY: mouseY
                    });

                    // TODO Update lineWidth
                    if (this._updateGroup) {
                        var group = this.group;
                        var scale = group.scale;
                        group.traverse(function (el) {
                            if (el.type === 'text') {
                                el.attr('scale', [1 / scale[0], 1 / scale[1]]);
                            }
                            // else if (el.type === 'polygon') {
                                // el.setStyle({

                                // });
                            // }
                        });
                    }
                }, this);

            controller.rect = geo.getViewRect();
        }
    };

    return MapDraw;
});